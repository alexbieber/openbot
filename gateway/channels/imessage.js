/**
 * iMessage Channel Adapter
 * Connects iMessage to OpenBot Gateway via BlueBubbles REST API.
 * Run standalone: node gateway/channels/imessage.js
 *
 * Setup:
 *   1. Install BlueBubbles Server on a Mac: https://bluebubbles.app
 *   2. Set BLUEBUBBLES_URL (e.g. http://your-mac:1234) and BLUEBUBBLES_PASSWORD
 *   3. Enable webhooks in BlueBubbles Server settings
 *   4. Point webhook to: http://your-server:8093/imessage/webhook
 */

import express from 'express';
import WebSocket from 'ws';
import axios from 'axios';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const AGENT_ID = process.env.AGENT_ID || 'default';
const BB_URL = process.env.BLUEBUBBLES_URL;
const BB_PASS = process.env.BLUEBUBBLES_PASSWORD;
const PORT = process.env.IMESSAGE_PORT || 8093;

if (!BB_URL || !BB_PASS) {
  console.error('[iMessage] Set BLUEBUBBLES_URL and BLUEBUBBLES_PASSWORD');
  process.exit(1);
}

const userSockets = new Map();
const chatGuids = new Map(); // sender handle → chat guid

function getOrCreateSocket(handle) {
  if (userSockets.has(handle)) return userSockets.get(handle);

  const ws = new WebSocket(GATEWAY_URL);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'handshake',
      role: 'channel',
      userId: `imessage:${handle}`,
      agentId: AGENT_ID,
      channel: 'imessage',
    }));
  });

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'message' && msg.content) {
      const chatGuid = chatGuids.get(handle);
      if (!chatGuid) return;
      try {
        await axios.post(`${BB_URL}/api/v1/message/text`, {
          chatGuid,
          message: msg.content,
          tempGuid: `openbot-${Date.now()}`,
        }, {
          headers: { 'x-password': BB_PASS },
          timeout: 10000,
        });
      } catch (err) {
        console.error(`[iMessage] Send failed:`, err.message);
      }
    }
  });

  ws.on('close', () => userSockets.delete(handle));
  ws.on('error', () => userSockets.delete(handle));

  userSockets.set(handle, ws);
  return ws;
}

const app = express();
app.use(express.json());

// BlueBubbles webhook handler
app.post('/imessage/webhook', (req, res) => {
  res.json({ ok: true });
  const { type, data } = req.body;

  if (type === 'new-message' && data) {
    if (data.isFromMe) return; // ignore outgoing

    const handle = data.handle?.address || data.chats?.[0]?.participants?.[0]?.address;
    const chatGuid = data.chats?.[0]?.guid;
    const text = data.text;

    if (!handle || !text) return;

    chatGuids.set(handle, chatGuid);
    const ws = getOrCreateSocket(handle);
    const sendMsg = () => ws.send(JSON.stringify({ type: 'message', content: text }));
    if (ws.readyState === WebSocket.OPEN) sendMsg();
    else ws.once('open', sendMsg);
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', channel: 'imessage' }));

app.listen(PORT, () => {
  console.log(`[iMessage] Adapter running on port ${PORT}`);
  console.log(`[iMessage] BlueBubbles: ${BB_URL}`);
  console.log(`[iMessage] Webhook URL: http://your-server:${PORT}/imessage/webhook`);
});
