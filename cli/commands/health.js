/**
 * openbot health — gateway health snapshot with per-channel probes
 * Mirrors ClawdBot's `openclaw health --json`
 */

import axios from 'axios';

export async function health(opts = {}) {
  const port = process.env.GATEWAY_PORT || 18789;
  const url = `http://127.0.0.1:${port}`;
  const timeout = (opts.timeout || 10) * 1000;
  const startAt = Date.now();

  try {
    const [healthRes, channelsRes, cronRes, tokensRes] = await Promise.allSettled([
      axios.get(`${url}/health`, { timeout }),
      axios.get(`${url}/channels/status`, { timeout }),
      axios.get(`${url}/cron`, { timeout }),
      axios.get(`${url}/tokens`, { timeout }),
    ]);

    const snapshot = {
      status: healthRes.status === 'fulfilled' ? 'ok' : 'unreachable',
      gateway: healthRes.status === 'fulfilled' ? healthRes.value.data : null,
      channels: channelsRes.status === 'fulfilled' ? channelsRes.value.data : {},
      cron: { jobs: cronRes.status === 'fulfilled' ? (cronRes.value.data || []).length : 0 },
      tokens: tokensRes.status === 'fulfilled' ? tokensRes.value.data : null,
      probeDurationMs: Date.now() - startAt,
      probedAt: new Date().toISOString(),
    };

    if (opts.json) {
      console.log(JSON.stringify(snapshot, null, 2));
    } else {
      const ok = snapshot.status === 'ok';
      console.log(`\nGateway: ${ok ? '\x1b[32m● ok\x1b[0m' : '\x1b[31m● unreachable\x1b[0m'}  (${snapshot.probeDurationMs}ms)`);
      if (snapshot.gateway) {
        console.log(`  Uptime: ${Math.round(snapshot.gateway.uptime)}s`);
        console.log(`  Model:  ${snapshot.gateway.model || '?'}`);
        console.log(`  WS clients: ${snapshot.gateway.connectedChannels || 0}`);
      }
      console.log('\nChannels:');
      for (const [name, info] of Object.entries(snapshot.channels)) {
        const dot = info.connected ? '\x1b[32m●\x1b[0m' : '\x1b[33m○\x1b[0m';
        console.log(`  ${dot} ${name}: ${info.status || 'unknown'}`);
      }
      if (snapshot.tokens) {
        console.log(`\nTokens: ${(snapshot.tokens.total_input + snapshot.tokens.total_output).toLocaleString()} total`);
      }
    }

    if (snapshot.status !== 'ok') process.exit(1);
  } catch (err) {
    if (opts.json) {
      console.log(JSON.stringify({ status: 'error', error: err.message }));
    } else {
      console.error('\x1b[31m✗ Gateway unreachable:', err.message, '\x1b[0m');
    }
    process.exit(1);
  }
}
