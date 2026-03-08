/**
 * openbot approvals — manage exec approvals allowlist
 * Commands: list, allow, deny, pending
 */

import axios from 'axios';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const APPROVALS_FILE = join(HOME, '.openbot', 'exec-approvals.json');
const PORT = process.env.GATEWAY_PORT || 18789;

function loadApprovals() {
  try { return existsSync(APPROVALS_FILE) ? JSON.parse(readFileSync(APPROVALS_FILE, 'utf-8')) : { binaries: [] }; }
  catch { return { binaries: [] }; }
}
function saveApprovals(data) { writeFileSync(APPROVALS_FILE, JSON.stringify(data, null, 2)); }

export async function approvals(subcommand = 'list', opts = {}) {
  switch (subcommand) {
    case 'list': {
      const data = loadApprovals();
      console.log('\nExec Approvals — Allowlist\n');
      if (!data.binaries?.length) { console.log('  (empty — no binaries allowed)'); }
      else { data.binaries.forEach(b => console.log(`  ✓ ${b}`)); }
      console.log(`\nSecurity mode: ${data.security || 'deny'}`);
      console.log(`Auto-allow skills: ${data.autoAllowSkills ? 'yes' : 'no'}`);
      console.log();
      break;
    }

    case 'allow': {
      const bin = opts.binary || opts._?.[0];
      if (!bin) { console.error('Binary path required'); return; }
      const data = loadApprovals();
      if (!data.binaries.includes(bin)) { data.binaries.push(bin); saveApprovals(data); }
      console.log(`\x1b[32m✓ Added to allowlist: ${bin}\x1b[0m`);
      break;
    }

    case 'remove':
    case 'deny': {
      const bin = opts.binary || opts._?.[0];
      if (!bin) { console.error('Binary path required'); return; }
      const data = loadApprovals();
      data.binaries = data.binaries.filter(b => b !== bin);
      saveApprovals(data);
      console.log(`\x1b[33m✓ Removed from allowlist: ${bin}\x1b[0m`);
      break;
    }

    case 'pending': {
      try {
        const res = await axios.get(`http://127.0.0.1:${PORT}/approvals/pending`, { timeout: 5000 });
        const pending = res.data || [];
        if (!pending.length) { console.log('No pending approvals'); break; }
        console.log('\nPending Exec Approvals:\n');
        pending.forEach(a => {
          console.log(`  [${a.id}] ${a.command?.slice(0, 80)}`);
          console.log(`         Agent: ${a.agentId} · ${new Date(a.createdAt).toLocaleString()}`);
        });
        console.log('\nTo approve: openbot approvals approve <id>');
        console.log('To deny:    openbot approvals deny <id>');
      } catch { console.error('Gateway not reachable'); }
      break;
    }

    case 'approve': {
      const id = opts._?.[0];
      if (!id) { console.error('Approval ID required'); return; }
      try {
        await axios.post(`http://127.0.0.1:${PORT}/approvals/${id}/approve`, {}, { timeout: 5000 });
        console.log(`\x1b[32m✓ Approved: ${id}\x1b[0m`);
      } catch { console.error('Failed to approve — is gateway running?'); }
      break;
    }

    case 'set-security': {
      const mode = opts._?.[0];
      if (!['deny', 'allowlist', 'full'].includes(mode)) { console.error('Mode must be: deny | allowlist | full'); return; }
      const data = loadApprovals();
      data.security = mode;
      saveApprovals(data);
      console.log(`\x1b[32m✓ Security mode set to: ${mode}\x1b[0m`);
      break;
    }

    default:
      console.log('Usage: openbot approvals <list|allow|remove|pending|approve|set-security>');
  }
}
