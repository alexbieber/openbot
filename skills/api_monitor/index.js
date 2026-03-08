/**
 * API Monitor Skill
 * Check and continuously monitor HTTP endpoints.
 */
import axios from 'axios';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const MONITORS_DIR = join(HOME, '.openbot', 'monitors');
mkdirSync(MONITORS_DIR, { recursive: true });

const activeMonitors = new Map();

function monitorPath(name) {
  return join(MONITORS_DIR, `${name.replace(/[^a-z0-9]/gi, '-')}.json`);
}

function loadMonitor(name) {
  const p = monitorPath(name);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; }
}

function saveMonitor(name, data) {
  writeFileSync(monitorPath(name), JSON.stringify(data, null, 2));
}

async function runCheck(url, expectedStatus = 200, timeout = 5000) {
  const start = Date.now();
  try {
    const res = await axios.get(url, {
      timeout,
      validateStatus: () => true,
      headers: { 'User-Agent': 'OpenBot-Monitor/1.0' },
    });
    const ms = Date.now() - start;
    const ok = res.status === expectedStatus;
    return { ok, status: res.status, ms, ts: new Date().toISOString(), error: null };
  } catch (err) {
    return { ok: false, status: null, ms: Date.now() - start, ts: new Date().toISOString(), error: err.message };
  }
}

export default async function execute({ action, url, name, interval = 5, expected_status = 200, timeout = 5000 }, context = {}) {
  switch (action) {
    case 'check': {
      if (!url) throw new Error('url required');
      const result = await runCheck(url, expected_status, timeout);
      const icon = result.ok ? '✅' : '❌';
      return `${icon} ${url}
Status: ${result.status || 'unreachable'}
Response time: ${result.ms}ms
${result.error ? `Error: ${result.error}` : `Expected: ${expected_status}`}`;
    }

    case 'start': {
      if (!url || !name) throw new Error('url and name required');
      if (activeMonitors.has(name)) return `Monitor "${name}" is already running.`;

      const monitor = {
        name, url, interval, expectedStatus: expected_status, timeout,
        started: new Date().toISOString(), checks: [], uptime: 100,
      };
      saveMonitor(name, monitor);

      const intervalId = setInterval(async () => {
        const result = await runCheck(url, expected_status, timeout);
        const m = loadMonitor(name) || monitor;
        m.checks.push(result);
        if (m.checks.length > 100) m.checks = m.checks.slice(-100);
        const upChecks = m.checks.filter(c => c.ok).length;
        m.uptime = ((upChecks / m.checks.length) * 100).toFixed(1);
        saveMonitor(name, m);

        if (!result.ok) {
          console.log(`[Monitor] ❌ ${name}: ${url} — ${result.error || result.status}`);
          // Alert via gateway
          axios.post('http://127.0.0.1:18789/message', {
            message: `🚨 Monitor alert: "${name}" (${url}) is DOWN! Status: ${result.status || 'unreachable'} Error: ${result.error || ''}`,
            userId: context.userId || 'monitor',
            channel: 'monitor',
          }).catch(() => {});
        }
      }, interval * 60 * 1000);

      activeMonitors.set(name, intervalId);
      return `✅ Monitor "${name}" started — checking ${url} every ${interval} min`;
    }

    case 'stop': {
      if (!name) throw new Error('name required');
      const id = activeMonitors.get(name);
      if (!id) return `Monitor "${name}" is not running.`;
      clearInterval(id);
      activeMonitors.delete(name);
      return `✅ Monitor "${name}" stopped`;
    }

    case 'status': {
      if (!name) throw new Error('name required');
      const m = loadMonitor(name);
      if (!m) return `Monitor "${name}" not found`;
      const recent = m.checks.slice(-5);
      const avgMs = recent.length ? Math.round(recent.reduce((s, c) => s + c.ms, 0) / recent.length) : 0;
      return `Monitor: ${name}
URL: ${m.url}
Uptime: ${m.uptime}% (last ${m.checks.length} checks)
Avg response: ${avgMs}ms
Last check: ${recent[recent.length - 1]?.ts || 'never'}
Recent: ${recent.map(c => c.ok ? '✅' : '❌').join(' ')}`;
    }

    case 'list': {
      const { readdirSync } = await import('fs');
      const files = readdirSync(MONITORS_DIR).filter(f => f.endsWith('.json'));
      if (!files.length) return 'No monitors configured.';
      const monitors = files.map(f => {
        const m = JSON.parse(readFileSync(join(MONITORS_DIR, f), 'utf-8'));
        const running = activeMonitors.has(m.name);
        return `${running ? '🟢' : '⚪'} ${m.name}: ${m.url} (${m.uptime || 100}% uptime)`;
      });
      return `Monitors (${files.length}):\n${monitors.join('\n')}`;
    }

    default: throw new Error(`Unknown action: ${action}`);
  }
}
