/**
 * Signal Channel Adapter
 * Connects Signal messenger to the OpenBot Gateway via signal-cli REST API.
 * Run standalone: node gateway/channels/signal.js
 *
 * Setup:
 *   1. Install signal-cli: https://github.com/AsamK/signal-cli
 *   2. Register your number: signal-cli -u +1234567890 register
 *   3. Start REST API: signal-cli -u +1234567890 daemon --http 127.0.0.1:8080
 *   4. Set SIGNAL_NUMBER and SIGNAL_API_URL
 */

import express from 'express';
import WebSocket from 'ws';
import axios from 'axios';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const AGENT_ID = process.env.AGENT_ID || 'default';
const SIGNAL_NUMBER = process.env.SIGNAL_NUMBER;
const SIGNAL_API_URL = process.env.SIGNAL_API_URL || 'http://127.0.0.1:8080';
const PORT = process.env.SIGNAL_PORT || 8092;

if (!SIGNAL_NUMBER) {
  console.error('[Signal] SIGNAL_NUMBER not set (e.g. +1234567890)');
  process.exit(1);
}

const userSockets = new Map();
const pendingReply = new Map();

function getOrCreateSocket(sender) {
  if (userSockets.has(sender)) return userSockets.get(sender);

  const ws = new WebSocket(GATEWAY_URL);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'handshake',
      role: 'channel',
      userId: `signal:${sender}`,
      agentId: AGENT_ID,
      channel: 'signal',
    }));
  });

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'message' && msg.content) {
      try {
        await axios.post(`${SIGNAL_API_URL}/v2/send`, {
          message: msg.content,
          number: SIGNAL_NUMBER,
          recipients: [sender],
        });
      } catch (err) {
        console.error(`[Signal] Send failed to ${sender}:`, err.message);
      }
    }
  });

  ws.on('close', () => userSockets.delete(sender));
  ws.on('error', () => userSockets.delete(sender));

  userSockets.set(sender, ws);
  return ws;
}

// Signal CLI sends webhooks to this endpoint when messages arrive
const app = express();
app.use(express.json());

app.post('/signal/receive', (req, res) => {
  res.json({ ok: true });
  const envelope = req.body?.envelope;
  if (!envelope) return;

  const sender = envelope.source;
  const text = envelope.dataMessage?.message;
  if (!text || !sender) return;

  const ws = getOrCreateSocket(sender);
  const sendMsg = () => ws.send(JSON.stringify({ type: 'message', content: text }));
  if (ws.readyState === WebSocket.OPEN) sendMsg();
  else ws.once('open', sendMsg);
});

// Poll for new messages (alternative to webhook)
async function pollMessages() {
  try {
    const res = await axios.get(`${SIGNAL_API_URL}/v1/receive/${SIGNAL_NUMBER}`, { timeout: 10000 });
    const messages = res.data || [];
    for (const envelope of messages) {
      const sender = envelope.source;
      const text = envelope.message;
      if (!text || !sender) continue;
      const ws = getOrCreateSocket(sender);
      const sendMsg = () => ws.send(JSON.stringify({ type: 'message', content: text }));
      if (ws.readyState === WebSocket.OPEN) sendMsg();
      else ws.once('open', sendMsg);
    }
  } catch {}
}

// Poll every 3 seconds as fallback
setInterval(pollMessages, 3000);

app.listen(PORT, () => {
  console.log(`[Signal] Adapter running on port ${PORT}`);
  console.log(`[Signal] Number: ${SIGNAL_NUMBER}`);
  console.log(`[Signal] Signal CLI API: ${SIGNAL_API_URL}`);
});
