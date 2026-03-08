/**
 * LINE Channel Adapter
 * Connects a LINE Messaging API bot to the OpenBot Gateway.
 * Run standalone: node gateway/channels/line.js
 *
 * Setup:
 *   1. Create a provider at https://developers.line.biz
 *   2. Set LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET
 *   3. Set webhook URL: https://your-server/line/webhook
 */

import express from 'express';
import { middleware, Client } from '@line/bot-sdk';
import WebSocket from 'ws';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const AGENT_ID = process.env.AGENT_ID || 'default';
const PORT = process.env.LINE_PORT || 8091;

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

if (!lineConfig.channelAccessToken || !lineConfig.channelSecret) {
  console.error('[LINE] LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET must be set.');
  process.exit(1);
}

const lineClient = new Client(lineConfig);
const userSockets = new Map();
const pendingReply = new Map(); // userId → replyToken

function getOrCreateSocket(userId) {
  if (userSockets.has(userId)) return userSockets.get(userId);

  const ws = new WebSocket(GATEWAY_URL);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'handshake',
      role: 'channel',
      userId: `line:${userId}`,
      agentId: AGENT_ID,
      channel: 'line',
    }));
  });

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());
    const replyToken = pendingReply.get(userId);

    if (msg.type === 'message' && msg.content && replyToken) {
      try {
        await lineClient.replyMessage(replyToken, {
          type: 'text',
          text: msg.content.substring(0, 5000), // LINE limit
        });
      } catch (err) {
        console.error(`[LINE] Reply failed:`, err.message);
      }
    }
  });

  ws.on('close', () => userSockets.delete(userId));
  ws.on('error', () => userSockets.delete(userId));

  userSockets.set(userId, ws);
  return ws;
}

const app = express();

app.post('/line/webhook', middleware(lineConfig), (req, res) => {
  res.json({ ok: true });
  req.body.events.forEach(async (event) => {
    if (event.type !== 'message' || event.message.type !== 'text') return;

    const userId = event.source.userId;
    const text = event.message.text;

    pendingReply.set(userId, event.replyToken);

    const ws = getOrCreateSocket(userId);
    const sendMsg = () => ws.send(JSON.stringify({ type: 'message', content: text }));
    if (ws.readyState === WebSocket.OPEN) sendMsg();
    else ws.once('open', sendMsg);
  });
});

app.listen(PORT, () => {
  console.log(`[LINE] Bot listening on port ${PORT}`);
  console.log(`[LINE] Webhook URL: https://your-domain/line/webhook`);
});
