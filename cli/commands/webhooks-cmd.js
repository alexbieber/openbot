/**
 * openbot webhooks — manage webhook subscriptions
 * Commands: list, add, remove, fire
 */

import axios from 'axios';

const PORT = process.env.GATEWAY_PORT || 18789;
const BASE = `http://127.0.0.1:${PORT}`;

export async function webhooks(subcommand = 'list', opts = {}) {
  switch (subcommand) {
    case 'list': {
      try {
        const res = await axios.get(`${BASE}/webhooks`, { timeout: 5000 });
        const hooks = res.data || [];
        if (!hooks.length) { console.log('No webhooks configured'); break; }
        console.log(`\nWebhooks (${hooks.length})\n`);
        hooks.forEach(h => {
          const status = h.enabled ? '\x1b[32m●\x1b[0m' : '\x1b[33m○\x1b[0m';
          console.log(`${status} [${h.id}] ${h.event.padEnd(20)} ${h.url}`);
          if (h.label && h.label !== h.url) console.log(`   Label: ${h.label}`);
        });
        console.log();
      } catch { console.error('Gateway not reachable'); }
      break;
    }

    case 'add': {
      const url = opts.url || opts._?.[0];
      const event = opts.event || opts.e || '*';
      if (!url) { console.error('URL required: --url https://...'); return; }
      try {
        const res = await axios.post(`${BASE}/webhooks`, { url, event, label: opts.label }, { timeout: 5000 });
        console.log(`\x1b[32m✓ Webhook added: ${res.data?.id}\x1b[0m`);
        console.log(`  URL: ${url}  Event: ${event}`);
      } catch (err) { console.error('Failed:', err.response?.data?.error || err.message); }
      break;
    }

    case 'remove':
    case 'delete': {
      const id = opts._?.[0] || opts.id;
      if (!id) { console.error('Webhook ID required'); return; }
      try {
        await axios.delete(`${BASE}/webhooks/${id}`, { timeout: 5000 });
        console.log(`\x1b[33m✓ Webhook removed: ${id}\x1b[0m`);
      } catch { console.error('Failed — is gateway running?'); }
      break;
    }

    case 'fire':
    case 'test': {
      const id = opts._?.[0] || opts.id;
      if (!id) { console.error('Webhook ID required'); return; }
      try {
        await axios.post(`${BASE}/webhooks/${id}/fire`, { test: true }, { timeout: 10000 });
        console.log(`\x1b[32m✓ Test fired for webhook: ${id}\x1b[0m`);
      } catch { console.error('Failed — is gateway running?'); }
      break;
    }

    default:
      console.log('Usage: openbot webhooks <list|add|remove|fire>');
      console.log('  add --url <url> --event <event>  (events: message.received, agent.end, cron.run, *)');
  }
}
