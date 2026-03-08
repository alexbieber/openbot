/**
 * OpenBot Exec Tool + Process Tool
 * Mirrors ClawdBot's exec with: foreground, background, PTY, send-keys, poll, approval flow.
 * Also implements the "process" subtool for background session management.
 */

import { spawn } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const DENYLIST = [
  'rm -rf /', 'sudo rm -rf', '> /dev/', 'mkfs', 'dd if=',
  ':(){:|:&};:', 'fork bomb', 'shutdown', 'halt', 'reboot',
];

export class ExecTool {
  constructor(config = {}) {
    this.config = config;
    this._processes = new Map(); // sessionId -> process info
    this._approvals = new Map(); // approvalId -> pending approval
    this._approvalFile = join(
      process.env.USERPROFILE || process.env.HOME || '/tmp',
      '.openbot', 'exec-approvals.json'
    );
    this._loadApprovals();
  }

  _loadApprovals() {
    try {
      if (existsSync(this._approvalFile)) {
        this._allowlist = JSON.parse(readFileSync(this._approvalFile, 'utf-8'));
      } else {
        this._allowlist = { binaries: [], autoAllowSkills: false };
      }
    } catch {
      this._allowlist = { binaries: [], autoAllowSkills: false };
    }
  }

  _saveApprovals() {
    try {
      writeFileSync(this._approvalFile, JSON.stringify(this._allowlist, null, 2));
    } catch {}
  }

  /** Check if command is denied */
  _isDenied(command) {
    const lower = command.toLowerCase();
    return DENYLIST.some(d => lower.includes(d));
  }

  /** Check if binary is in allowlist */
  _isAllowed(command) {
    const security = this.config?.tools?.exec?.security || 'deny';
    if (security === 'full') return true;
    if (security === 'deny') return false;
    // allowlist mode
    const bin = command.trim().split(/\s+/)[0];
    return this._allowlist.binaries?.includes(bin) || false;
  }

  /**
   * Run a command.
   * @param {object} params - { command, workdir, env, timeout, background, yieldMs, pty, host, security, ask }
   * @param {string} agentId - for process session scoping
   */
  async run(params = {}, agentId = 'default') {
    const {
      command,
      workdir = process.cwd(),
      env = {},
      timeout = 1800,
      background = false,
      yieldMs = 10000,
      host = 'sandbox',
      security,
      ask = 'on-miss',
    } = params;

    if (!command) return { error: 'command required', status: 'error' };

    // Security check
    if (this._isDenied(command)) {
      return { error: `Command blocked by security policy: ${command.slice(0, 60)}`, status: 'denied' };
    }

    // Determine effective security
    const effectiveSecurity = security || this.config?.tools?.exec?.security || 'deny';

    if (effectiveSecurity === 'deny' && host !== 'sandbox') {
      return { error: 'Exec denied by security policy. Set tools.exec.security=allowlist or =full to allow.', status: 'denied' };
    }

    if (effectiveSecurity === 'allowlist' && !this._isAllowed(command)) {
      if (ask === 'always' || (ask === 'on-miss' && !this._isAllowed(command))) {
        // Return approval-pending
        const approvalId = uuidv4();
        this._approvals.set(approvalId, { command, agentId, createdAt: Date.now(), status: 'pending' });
        return { status: 'approval-pending', approvalId, command };
      }
      return { error: 'Command not in allowlist', status: 'denied' };
    }

    // Merge env
    const mergedEnv = { ...process.env, OPENBOT_SHELL: 'exec', ...env };
    // Remove dangerous overrides
    delete mergedEnv.LD_PRELOAD;
    delete mergedEnv.LD_LIBRARY_PATH;
    delete mergedEnv.DYLD_INSERT_LIBRARIES;

    if (background) {
      return this._runBackground(command, { workdir, env: mergedEnv, timeout, agentId });
    }

    return this._runForeground(command, { workdir, env: mergedEnv, timeout, yieldMs });
  }

  _runForeground(command, { workdir, env, timeout }) {
    return new Promise((resolve) => {
      const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/sh');
      const shellArgs = process.platform === 'win32' ? ['-Command', command] : ['-c', command];

      const proc = spawn(shell, shellArgs, { cwd: workdir, env, stdio: 'pipe' });
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
      }, timeout * 1000);

      proc.stdout?.on('data', d => { stdout += d.toString(); });
      proc.stderr?.on('data', d => { stderr += d.toString(); });

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          status: timedOut ? 'timeout' : (code === 0 ? 'ok' : 'error'),
          exitCode: code,
          stdout: stdout.slice(0, 50000),
          stderr: stderr.slice(0, 10000),
          timedOut,
        });
      });

      proc.on('error', err => {
        clearTimeout(timer);
        resolve({ status: 'error', error: err.message, stdout, stderr });
      });
    });
  }

  _runBackground(command, { workdir, env, timeout, agentId }) {
    const sessionId = uuidv4();
    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/sh');
    const shellArgs = process.platform === 'win32' ? ['-Command', command] : ['-c', command];

    const proc = spawn(shell, shellArgs, { cwd: workdir, env, stdio: 'pipe', detached: false });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => proc.kill('SIGTERM'), timeout * 1000);

    proc.stdout?.on('data', d => { stdout += d.toString(); });
    proc.stderr?.on('data', d => { stderr += d.toString(); });

    const info = {
      sessionId, agentId, command, startedAt: Date.now(),
      status: 'running', proc, stdout: () => stdout, stderr: () => stderr,
    };

    proc.on('close', (code) => {
      clearTimeout(timer);
      info.status = code === 0 ? 'exited' : 'error';
      info.exitCode = code;
      info.endedAt = Date.now();
    });

    proc.on('error', err => {
      clearTimeout(timer);
      info.status = 'error';
      info.error = err.message;
    });

    this._processes.set(sessionId, info);
    return Promise.resolve({ status: 'background', sessionId, command });
  }

  // ── Process Tool ──────────────────────────────────────────────────────────

  process(action, sessionId, opts = {}) {
    const session = this._processes.get(sessionId);

    switch (action) {
      case 'poll': {
        if (!session) return { error: 'session not found', sessionId };
        return {
          sessionId,
          status: session.status,
          exitCode: session.exitCode,
          stdout: session.stdout?.().slice(-20000) || '',
          stderr: session.stderr?.().slice(-5000) || '',
          runtimeMs: Date.now() - session.startedAt,
        };
      }

      case 'send-keys': {
        if (!session || !session.proc?.stdin) return { error: 'session not found or no stdin' };
        const keys = (opts.keys || []).map(k => {
          if (k === 'Enter') return '\n';
          if (k === 'C-c') return '\x03';
          if (k === 'C-d') return '\x04';
          if (k === 'Up') return '\x1b[A';
          if (k === 'Down') return '\x1b[B';
          return k;
        }).join('');
        session.proc.stdin.write(keys);
        return { ok: true, sessionId };
      }

      case 'submit': {
        if (!session || !session.proc?.stdin) return { error: 'session not found or no stdin' };
        session.proc.stdin.write('\n');
        return { ok: true, sessionId };
      }

      case 'paste': {
        if (!session || !session.proc?.stdin) return { error: 'session not found or no stdin' };
        const text = opts.text || '';
        session.proc.stdin.write(text);
        return { ok: true, sessionId, chars: text.length };
      }

      case 'kill': {
        if (!session) return { error: 'session not found' };
        session.proc?.kill('SIGTERM');
        return { ok: true, sessionId };
      }

      case 'list': {
        const list = [];
        for (const [sid, s] of this._processes) {
          list.push({ sessionId: sid, agentId: s.agentId, command: s.command.slice(0, 80), status: s.status, runtimeMs: Date.now() - s.startedAt });
        }
        return list;
      }

      default:
        return { error: `Unknown action: ${action}` };
    }
  }

  // ── Approvals ─────────────────────────────────────────────────────────────

  listPendingApprovals() {
    return Array.from(this._approvals.entries()).map(([id, a]) => ({ id, ...a, proc: undefined }));
  }

  approveExec(approvalId) {
    const pending = this._approvals.get(approvalId);
    if (!pending) return { error: 'not found' };
    pending.status = 'approved';
    this._approvals.delete(approvalId);
    return { ok: true, approvalId, command: pending.command };
  }

  denyExec(approvalId) {
    const pending = this._approvals.get(approvalId);
    if (!pending) return { error: 'not found' };
    pending.status = 'denied';
    this._approvals.delete(approvalId);
    return { ok: true, approvalId };
  }

  addToAllowlist(binary) {
    if (!this._allowlist.binaries.includes(binary)) {
      this._allowlist.binaries.push(binary);
      this._saveApprovals();
    }
    return this._allowlist;
  }

  removeFromAllowlist(binary) {
    this._allowlist.binaries = this._allowlist.binaries.filter(b => b !== binary);
    this._saveApprovals();
    return this._allowlist;
  }

  getApprovals() { return this._allowlist; }
}
