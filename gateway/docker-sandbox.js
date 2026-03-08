/**
 * Docker Sandbox — per-agent isolated execution environment.
 * Wraps exec calls in a Docker container with resource limits and filesystem isolation.
 *
 * Config (in openbot.json or per-agent SOUL.md):
 *   sandbox:
 *     enabled: true
 *     image: "node:20-alpine"        # base image
 *     memory: "256m"                  # memory limit
 *     cpus: "0.5"                     # CPU limit
 *     network: "none"                 # network mode (none|bridge|host)
 *     readOnlyRoot: true              # mount root filesystem read-only
 *     allowedBinds: []                # host paths to mount read-only
 *     workdir: "/workspace"
 *     env: {}                         # additional env vars
 *     user: "nobody"
 *     timeout: 30000
 */

import { execSync, spawn } from 'child_process';

const DEFAULTS = {
  enabled: false,
  image: 'node:20-alpine',
  memory: '256m',
  cpus: '0.5',
  network: 'none',
  readOnlyRoot: false,
  allowedBinds: [],
  workdir: '/workspace',
  env: {},
  user: '',
  timeout: 30000,
};

function isDockerAvailable() {
  try { execSync('docker info', { stdio: 'pipe', timeout: 5000 }); return true; }
  catch { return false; }
}

function buildDockerArgs(cfg, extraEnv = {}) {
  const args = ['run', '--rm', '--init'];

  args.push('-m', cfg.memory);
  args.push('--cpus', String(cfg.cpus));
  args.push('--net', cfg.network);
  args.push('-w', cfg.workdir);

  if (cfg.readOnlyRoot) args.push('--read-only');
  if (cfg.user) args.push('-u', cfg.user);

  // Security defaults
  args.push('--security-opt', 'no-new-privileges:true');
  args.push('--cap-drop', 'ALL');

  // Environment variables
  const allEnv = { ...cfg.env, ...extraEnv };
  for (const [k, v] of Object.entries(allEnv)) {
    args.push('-e', `${k}=${v}`);
  }

  // Bind mounts (read-only by default)
  for (const bind of (cfg.allowedBinds || [])) {
    if (typeof bind === 'string') args.push('-v', `${bind}:${bind}:ro`);
    else if (bind.host && bind.container) args.push('-v', `${bind.host}:${bind.container}${bind.readOnly !== false ? ':ro' : ''}`);
  }

  args.push(cfg.image);
  return args;
}

export class DockerSandbox {
  constructor(config = {}) {
    this.config = { ...DEFAULTS, ...(config.sandbox || {}) };
    this._available = null;
  }

  isEnabled() {
    return this.config.enabled;
  }

  checkAvailable() {
    if (this._available === null) this._available = isDockerAvailable();
    return this._available;
  }

  async pullImage() {
    if (!this.checkAvailable()) return false;
    try {
      execSync(`docker pull ${this.config.image}`, { stdio: 'pipe', timeout: 120000 });
      return true;
    } catch { return false; }
  }

  async run(command, opts = {}) {
    if (!this.isEnabled()) return { sandboxed: false };
    if (!this.checkAvailable()) return { ok: false, error: 'Docker not available' };

    const cfg = { ...this.config, ...(opts.sandboxOverride || {}) };
    const dockerArgs = buildDockerArgs(cfg, opts.env || {});

    // Append shell command
    dockerArgs.push('sh', '-c', command);

    return new Promise(resolve => {
      const timeout = cfg.timeout;
      const proc = spawn('docker', dockerArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve({ ok: false, sandboxed: true, error: `Timed out after ${timeout}ms`, stdout, stderr });
      }, timeout);

      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => stderr += d);
      proc.on('close', code => {
        clearTimeout(timer);
        resolve({ ok: code === 0, sandboxed: true, exitCode: code, stdout: stdout.trim(), stderr: stderr.trim() });
      });
      proc.on('error', err => {
        clearTimeout(timer);
        resolve({ ok: false, sandboxed: true, error: err.message });
      });
    });
  }

  // Get sandbox config summary for an agent
  summary() {
    return {
      enabled: this.config.enabled,
      image: this.config.image,
      memory: this.config.memory,
      cpus: this.config.cpus,
      network: this.config.network,
      dockerAvailable: this.checkAvailable(),
    };
  }
}
