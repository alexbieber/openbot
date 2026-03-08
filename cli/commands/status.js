/**
 * openbot status — local summary & deep gateway health check
 * Mirrors ClawdBot's `openclaw status` command
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const DATA_DIR = join(HOME, '.openbot');

function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function red(s) { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function cyan(s) { return `\x1b[36m${s}\x1b[0m`; }
function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function dim(s) { return `\x1b[2m${s}\x1b[0m`; }

export async function status(opts = {}) {
  const port = process.env.GATEWAY_PORT || 18789;
  const url = `http://127.0.0.1:${port}`;

  console.log(`\n${bold('OpenBot Status')}\n${'─'.repeat(50)}`);

  // ── Gateway reachability ────────────────────────────────────────────────
  process.stdout.write('Gateway            ');
  try {
    const res = await axios.get(`${url}/health`, { timeout: 5000 });
    const d = res.data;
    console.log(`${green('●')} running  ${dim(`(uptime: ${Math.round(d.uptime)}s · model: ${d.model || '?'})`)}`);

    if (opts.all || opts.deep) {
      // ── Channel status ────────────────────────────────────────────────
      try {
        const ch = await axios.get(`${url}/channels/status`, { timeout: 5000 });
        console.log(`\n${bold('Channels')}`);
        for (const [name, info] of Object.entries(ch.data || {})) {
          const dot = info.connected ? green('●') : yellow('○');
          console.log(`  ${dot} ${name.padEnd(18)} ${info.status || 'unknown'}`);
        }
      } catch {}

      // ── Session summary ───────────────────────────────────────────────
      try {
        const conv = await axios.get(`${url}/conversations`, { timeout: 5000 });
        const sessions = conv.data || [];
        console.log(`\n${bold('Sessions')}  ${sessions.length} stored`);
        const recent = sessions.slice(-5).reverse();
        for (const s of recent) {
          console.log(`  ${dim(s.sessionId || s.id || '?')}  ${dim(s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '')}`);
        }
      } catch {}

      // ── Token usage ───────────────────────────────────────────────────
      try {
        const tok = await axios.get(`${url}/tokens`, { timeout: 5000 });
        const d = tok.data;
        console.log(`\n${bold('Tokens')}   input: ${(d.total_input || 0).toLocaleString()}  output: ${(d.total_output || 0).toLocaleString()}`);
      } catch {}
    }

    // ── Cron ──────────────────────────────────────────────────────────────
    try {
      const cron = await axios.get(`${url}/cron`, { timeout: 3000 });
      const jobs = cron.data || [];
      const active = jobs.filter(j => j.enabled !== false).length;
      console.log(`\nCron Jobs          ${active} active / ${jobs.length} total`);
    } catch {}

  } catch {
    console.log(`${red('●')} unreachable  ${dim(`(start with: node gateway/server.js)`)}`);
  }

  // ── Local config ─────────────────────────────────────────────────────────
  console.log(`\n${bold('Config')}`);
  const configPath = join(DATA_DIR, 'config.json');
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
      console.log(`  Model:    ${cfg.ai?.defaultModel || dim('not set')}`);
      const chans = Object.keys(cfg.channels || {}).filter(k => k !== 'dmPolicy');
      console.log(`  Channels: ${chans.length ? chans.join(', ') : dim('none configured')}`);
      console.log(`  DM Policy: ${cfg.channels?.dmPolicy || 'pairing'}`);
    } catch {}
  } else {
    console.log(`  ${yellow('!')} No config found — run: ${cyan('node cli/index.js onboard')}`);
  }

  console.log(`\n  Data dir: ${dim(DATA_DIR)}`);
  console.log();

  // ── Update hint ──────────────────────────────────────────────────────────
  const pkgPath = join(process.cwd(), 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      console.log(`${dim(`Version: ${pkg.version || '?'} · Run \`openbot update\` to check for updates`)}`);
    } catch {}
  }
}
