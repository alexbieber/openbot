/**
 * Feishu (Lark) Channel Adapter
 * Connects Feishu/Lark to OpenBot Gateway via Event Subscription.
 * Run standalone: node gateway/channels/feishu.js
 *
 * Setup:
 *   1. Create a bot app at open.feishu.cn
 *   2. Set FEISHU_APP_ID, FEISHU_APP_SECRET
 *   3. Set webhook URL to http://your-server:8098/feishu/event
 */

import express from 'express';
import WebSocket from 'ws';
import axios from 'axios';
import crypto from 'crypto';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const AGENT_ID = process.env.AGENT_ID || 'default';
const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const PORT = process.env.FEISHU_PORT || 8098;
const VERIFY_TOKEN = process.env.FEISHU_VERIFY_TOKEN || '';

if (!APP_ID || !APP_SECRET) {
  console.error('[Feishu] Set FEISHU_APP_ID and FEISHU_APP_SECRET');
  process.exit(1);
}

let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: APP_ID, app_secret: APP_SECRET,
  });
  accessToken = res.data.tenant_access_token;
  tokenExpiry = Date.now() + (res.data.expire - 60) * 1000;
  return accessToken;
}

const userSockets = new Map();

function getOrCreateSocket(userId) {
  if (userSockets.has(userId)) return userSockets.get(userId);
  const ws = new WebSocket(GATEWAY_URL);
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'handshake', role: 'channel', userId: `feishu:${userId}`, agentId: AGENT_ID, channel: 'feishu' }));
  });
  ws.on('message', async raw => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'message' && msg.content) {
      const token = await getAccessToken();
      const chatId = userSockets.get(`${userId}:chat`);
      if (!chatId) return;
      await axios.post('https://open.feishu.cn/open-apis/im/v1/messages', {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: msg.content }),
      }, { headers: { Authorization: `Bearer ${token}` }, params: { receive_id_type: 'chat_id' } });
    }
  });
  ws.on('close', () => userSockets.delete(userId));
  userSockets.set(userId, ws);
  return ws;
}

const app = express();
app.use(express.json());

app.post('/feishu/event', (req, res) => {
  const body = req.body;

  // URL verification challenge
  if (body.challenge) return res.json({ challenge: body.challenge });

  // Signature verification
  if (VERIFY_TOKEN && body.header?.token !== VERIFY_TOKEN) return res.status(403).json({ error: 'invalid token' });

  res.json({ msg: 'ok' });

  const event = body.event;
  if (!event?.message) return;

  const userId = event.sender?.sender_id?.user_id;
  const chatId = event.message?.chat_id;
  const content = JSON.parse(event.message?.content || '{}').text || '';

  if (!userId || !content) return;

  userSockets.set(`${userId}:chat`, chatId);
  const ws = getOrCreateSocket(userId);
  const send = () => ws.send(JSON.stringify({ type: 'message', content: content.trim() }));
  if (ws.readyState === WebSocket.OPEN) send();
  else ws.once('open', send);
});

app.listen(PORT, () => {
  console.log(`[Feishu] Adapter running on port ${PORT}`);
  console.log(`[Feishu] Webhook: http://your-server:${PORT}/feishu/event`);
});
