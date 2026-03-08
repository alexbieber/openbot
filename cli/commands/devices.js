/**
 * openbot devices — manage paired devices / Control UI connections
 * Commands: list, approve, revoke
 */

import axios from 'axios';

const PORT = process.env.GATEWAY_PORT || 18789;
const BASE = `http://127.0.0.1:${PORT}`;

export async function devices(subcommand = 'list', opts = {}) {
  switch (subcommand) {
    case 'list': {
      try {
        const [pending, allowed] = await Promise.all([
          axios.get(`${BASE}/pairing/pending`, { timeout: 5000 }),
          axios.get(`${BASE}/pairing/allowed`, { timeout: 5000 }),
        ]);
        const pendingList = pending.data || [];
        const allowedList = allowed.data || [];
        console.log('\nPaired Devices\n');
        if (!allowedList.length) { console.log('  (no approved devices)'); }
        else { allowedList.forEach(d => console.log(`  ✓ [${d.id}] ${d.label || d.id}  ${d.approvedAt ? new Date(d.approvedAt).toLocaleDateString() : ''}`)); }
        if (pendingList.length) {
          console.log(`\nPending Approval (${pendingList.length}):`);
          pendingList.forEach(d => console.log(`  ? [${d.id}] code: ${d.code}  ${d.requestedAt ? new Date(d.requestedAt).toLocaleString() : ''}`));
          console.log('\nTo approve: openbot devices approve <id>');
        }
        console.log();
      } catch { console.error('Gateway not reachable'); }
      break;
    }

    case 'approve': {
      const id = opts._?.[0] || opts.id;
      if (!id) { console.error('Device request ID required'); return; }
      try {
        await axios.post(`${BASE}/pairing/allow`, { requestId: id }, { timeout: 5000 });
        console.log(`\x1b[32m✓ Device approved: ${id}\x1b[0m`);
      } catch { console.error('Failed — is gateway running?'); }
      break;
    }

    case 'revoke': {
      const id = opts._?.[0] || opts.id;
      if (!id) { console.error('Device ID required'); return; }
      try {
        await axios.post(`${BASE}/pairing/deny`, { requestId: id }, { timeout: 5000 });
        console.log(`\x1b[33m✓ Device revoked: ${id}\x1b[0m`);
      } catch { console.error('Failed — is gateway running?'); }
      break;
    }

    default:
      console.log('Usage: openbot devices <list|approve|revoke>');
  }
}
