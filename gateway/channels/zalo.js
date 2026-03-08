/**
 * Zalo Official Account Channel Adapter
 * Connects Zalo OA to OpenBot Gateway via Zalo API.
 * Run standalone: node gateway/channels/zalo.js
 *
 * Setup:
 *   1. Create a Zalo OA at oa.zalo.me
 *   2. Set ZALO_APP_ID, ZALO_APP_SECRET, ZALO_OA_ACCESS_TOKEN
 *   3. Set webhook to http://your-server:8099/zalo/webhook
 */

import express from 'express';
import WebSocket from 'ws';
import axios from 'axios';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const AGENT_ID = process.env.AGENT_ID || 'default';
const ACCESS_TOKEN = process.env.ZALO_OA_ACCESS_TOKEN;
const PORT = process.env.ZALO_PORT || 8099;

if (!ACCESS_TOKEN) {
  console.error('[Zalo] Set ZALO_OA_ACCESS_TOKEN');
  process.exit(1);
}

const userSockets = new Map();

function getOrCreateSocket(userId) {
  if (userSockets.has(userId)) return userSockets.get(userId);
  const ws = new WebSocket(GATEWAY_URL);
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'handshake', role: 'channel', userId: `zalo:${userId}`, agentId: AGENT_ID, channel: 'zalo' }));
  });
  ws.on('message', async raw => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'message' && msg.content) {
      await axios.post('https://openapi.zalo.me/v3.0/oa/message/cs', {
        recipient: { user_id: userId },
        message: { text: msg.content },
      }, { headers: { access_token: ACCESS_TOKEN } }).catch(e => console.error('[Zalo] Send error:', e.message));
    }
  });
  ws.on('close', () => userSockets.delete(userId));
  userSockets.set(userId, ws);
  return ws;
}

const app = express();
app.use(express.json());

app.post('/zalo/webhook', (req, res) => {
  res.json({ error: 0, message: 'ok' });
  const event = req.body;
  if (event.event_name !== 'user_send_text') return;

  const userId = event.sender?.id;
  const text = event.message?.text;
  if (!userId || !text) return;

  const ws = getOrCreateSocket(userId);
  const send = () => ws.send(JSON.stringify({ type: 'message', content: text }));
  if (ws.readyState === WebSocket.OPEN) send();
  else ws.once('open', send);
});

app.listen(PORT, () => {
  console.log(`[Zalo] Adapter running on port ${PORT}`);
  console.log(`[Zalo] Webhook: http://your-server:${PORT}/zalo/webhook`);
});
