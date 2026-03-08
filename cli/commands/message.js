/**
 * openbot message — send a message directly via CLI
 * Usage: openbot message send --target <userId> --message "Hello" --agent <agentId>
 */

import axios from 'axios';

const PORT = process.env.GATEWAY_PORT || 18789;
const BASE = `http://127.0.0.1:${PORT}`;

export async function message(subcommand = 'send', opts = {}) {
  switch (subcommand) {
    case 'send': {
      const text = opts.message || opts.m || opts._?.[0];
      if (!text) { console.error('Message required: --message "text"'); process.exit(1); }
      const agentId = opts.agent || opts.a || 'default';
      const userId = opts.target || opts.t || 'cli-user';

      try {
        const res = await axios.post(`${BASE}/message`, {
          message: text, agentId, userId, channel: 'cli',
        }, { timeout: 60000 });
        console.log('\x1b[36m' + (res.data?.response || res.data?.content || JSON.stringify(res.data)) + '\x1b[0m');
      } catch (err) {
        console.error('Error:', err.response?.data?.error || err.message);
        process.exit(1);
      }
      break;
    }

    case 'stream': {
      const text = opts.message || opts.m || opts._?.[0];
      if (!text) { console.error('Message required'); process.exit(1); }
      const agentId = opts.agent || opts.a || 'default';
      const userId = opts.target || opts.t || 'cli-user';
      const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
      const fetchFn = fetch || globalThis.fetch;

      const url = `${BASE}/stream?message=${encodeURIComponent(text)}&agentId=${encodeURIComponent(agentId)}&userId=${encodeURIComponent(userId)}`;
      process.stdout.write('\x1b[36m');
      try {
        const res = await fetchFn(url);
        for await (const chunk of res.body) {
          const lines = chunk.toString().split('\n').filter(l => l.startsWith('data: '));
          for (const line of lines) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.token) process.stdout.write(event.token);
              else if (event.content) { process.stdout.write('\n'); }
              else if (event.error) { process.stdout.write('\n\x1b[31mError: ' + event.error + '\x1b[0m\n'); }
            } catch {}
          }
        }
        process.stdout.write('\x1b[0m\n');
      } catch (err) {
        process.stdout.write('\x1b[0m\n');
        console.error('Stream error:', err.message);
      }
      break;
    }

    default:
      console.log('Usage: openbot message send --message "text" [--agent <id>] [--target <userId>]');
      console.log('       openbot message stream --message "text"');
  }
}
