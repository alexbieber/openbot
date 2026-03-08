/**
 * WhatsApp Channel Adapter
 * Connects WhatsApp to the OpenBot Gateway via whatsapp-web.js.
 * Scans a QR code once, then stays connected.
 * Run standalone: node gateway/channels/whatsapp.js
 */

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import WebSocket from 'ws';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const AGENT_ID = process.env.AGENT_ID || 'default';
// Only respond to messages from this number (leave empty to respond to all)
const ALLOWED_NUMBER = process.env.WHATSAPP_ALLOWED_NUMBER || '';

const userSockets = new Map(); // phone → WebSocket
const pendingReply = new Map(); // phone → { client, chatId }

function getOrCreateSocket(phone) {
  if (userSockets.has(phone)) return userSockets.get(phone);

  const ws = new WebSocket(GATEWAY_URL);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'handshake',
      role: 'channel',
      userId: `whatsapp:${phone}`,
      agentId: AGENT_ID,
      channel: 'whatsapp',
    }));
  });

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());
    const pending = pendingReply.get(phone);
    if (!pending) return;

    if (msg.type === 'message' && msg.content) {
      try {
        const chat = await pending.client.getChatById(pending.chatId);
        await chat.sendMessage(msg.content);
      } catch (err) {
        console.error(`[WhatsApp] Failed to send reply to ${phone}:`, err.message);
      }
    }

    if (msg.type === 'typing' && msg.typing) {
      try {
        const chat = await pending.client.getChatById(pending.chatId);
        await chat.sendStateTyping();
      } catch {}
    }
  });

  ws.on('close', () => userSockets.delete(phone));
  ws.on('error', () => userSockets.delete(phone));

  userSockets.set(phone, ws);
  return ws;
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: process.env.HOME + '/.openbot/whatsapp-session' }),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
});

client.on('qr', async (qr) => {
  console.log('\n[WhatsApp] Scan this QR code with your phone:\n');
  qrcode.generate(qr, { small: true });
  // Publish QR for browser dashboard
  try {
    const qrcodeLib = await import('qrcode').catch(() => null);
    const dataUrl = qrcodeLib ? await qrcodeLib.default.toDataURL(qr) : null;
    if (globalThis._openBotQRData) {
      globalThis._openBotQRData.whatsapp = { text: qr, dataUrl, at: new Date().toISOString() };
    }
  } catch {}
  console.log('\n[WhatsApp] QR also available in dashboard → Channels panel\n');
});

client.on('ready', () => {
  console.log('[WhatsApp] Client ready. Listening for messages...');
});

client.on('message', async (message) => {
  // Ignore group messages unless explicitly mentioned
  if (message.isGroupMsg) return;
  // Ignore status updates
  if (message.from === 'status@broadcast') return;

  const phone = message.from.replace('@c.us', '');

  // Allowlist check
  if (ALLOWED_NUMBER && phone !== ALLOWED_NUMBER) return;

  pendingReply.set(phone, { client, chatId: message.from });
  const ws = getOrCreateSocket(phone);

  const sendMsg = () => ws.send(JSON.stringify({ type: 'message', content: message.body }));
  if (ws.readyState === WebSocket.OPEN) sendMsg();
  else ws.once('open', sendMsg);
});

client.on('auth_failure', (msg) => {
  console.error('[WhatsApp] Auth failure:', msg);
});

client.on('disconnected', (reason) => {
  console.log('[WhatsApp] Disconnected:', reason);
});

console.log('[WhatsApp] Initializing... (this may take 30s on first run)');
client.initialize();
