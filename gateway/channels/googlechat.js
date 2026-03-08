/**
 * Google Chat Channel Adapter
 * Connects a Google Chat Bot to the OpenBot Gateway.
 * Uses HTTP endpoint (Google Chat calls your server via webhooks).
 * Run standalone: node gateway/channels/googlechat.js
 *
 * Setup:
 *   1. Go to Google Cloud Console → APIs → Google Chat API
 *   2. Configure bot with endpoint: https://your-server/googlechat
 *   3. Set GOOGLE_CHAT_VERIFICATION_TOKEN
 */

import express from 'express';
import WebSocket from 'ws';
import axios from 'axios';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const AGENT_ID = process.env.AGENT_ID || 'default';
const VERIFICATION_TOKEN = process.env.GOOGLE_CHAT_VERIFICATION_TOKEN;
const PORT = process.env.GCHAT_PORT || 8090;

const userSockets = new Map();
const pendingCallbacks = new Map(); // spaceId → { threadKey, webhookUrl }

function getOrCreateSocket(spaceId) {
  if (userSockets.has(spaceId)) return userSockets.get(spaceId);

  const ws = new WebSocket(GATEWAY_URL);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'handshake',
      role: 'channel',
      userId: `gchat:${spaceId}`,
      agentId: AGENT_ID,
      channel: 'googlechat',
    }));
  });

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());
    const pending = pendingCallbacks.get(spaceId);
    if (msg.type === 'message' && msg.content && pending?.webhookUrl) {
      try {
        await axios.post(pending.webhookUrl, {
          text: msg.content,
          thread: pending.threadKey ? { threadKey: pending.threadKey } : undefined,
        });
      } catch (err) {
        console.error(`[GoogleChat] Reply failed:`, err.message);
      }
    }
  });

  ws.on('close', () => userSockets.delete(spaceId));
  ws.on('error', () => userSockets.delete(spaceId));

  userSockets.set(spaceId, ws);
  return ws;
}

const app = express();
app.use(express.json());

app.post('/googlechat', (req, res) => {
  const event = req.body;

  // Verify token if set
  if (VERIFICATION_TOKEN && event.token !== VERIFICATION_TOKEN) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  if (event.type === 'MESSAGE') {
    const spaceId = event.space?.name || 'unknown';
    const text = event.message?.text?.trim();
    if (!text) return res.json({ text: '' });

    const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;
    pendingCallbacks.set(spaceId, { webhookUrl, threadKey: event.message?.thread?.name });

    const ws = getOrCreateSocket(spaceId);
    const sendMsg = () => ws.send(JSON.stringify({ type: 'message', content: text }));
    if (ws.readyState === WebSocket.OPEN) sendMsg();
    else ws.once('open', sendMsg);

    return res.json({ text: '...' });
  }

  if (event.type === 'ADDED_TO_SPACE') {
    return res.json({ text: 'OpenBot connected! Send me a message anytime.' });
  }

  res.json({ text: '' });
});

app.listen(PORT, () => {
  console.log(`[GoogleChat] Bot listening on port ${PORT}`);
});
