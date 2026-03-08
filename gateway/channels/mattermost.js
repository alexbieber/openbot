/**
 * Mattermost Channel Adapter
 * Connects Mattermost to OpenBot Gateway via websocket driver.
 * Run standalone: node gateway/channels/mattermost.js
 *
 * Setup:
 *   1. Create a bot account in Mattermost
 *   2. Generate a Personal Access Token
 *   3. Set MATTERMOST_URL, MATTERMOST_TOKEN, MATTERMOST_TEAM
 */

import WebSocket from 'ws';
import axios from 'axios';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const AGENT_ID = process.env.AGENT_ID || 'default';
const MM_URL = process.env.MATTERMOST_URL?.replace(/\/$/, '');
const MM_TOKEN = process.env.MATTERMOST_TOKEN;
const MM_TEAM = process.env.MATTERMOST_TEAM || '';

if (!MM_URL || !MM_TOKEN) {
  console.error('[Mattermost] Set MATTERMOST_URL and MATTERMOST_TOKEN');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${MM_TOKEN}` };
const userSockets = new Map();
let botUserId;

async function getBotUserId() {
  const res = await axios.get(`${MM_URL}/api/v4/users/me`, { headers });
  return res.data.id;
}

function getOrCreateSocket(userId, channelId) {
  const key = `${userId}:${channelId}`;
  if (userSockets.has(key)) return userSockets.get(key);

  const ws = new WebSocket(GATEWAY_URL);
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'handshake', role: 'channel', userId: `mm:${userId}`, agentId: AGENT_ID, channel: 'mattermost' }));
  });
  ws.on('message', async raw => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'message' && msg.content) {
      await axios.post(`${MM_URL}/api/v4/posts`, { channel_id: channelId, message: msg.content }, { headers });
    }
  });
  ws.on('close', () => userSockets.delete(key));
  userSockets.set(key, ws);
  return ws;
}

async function connect() {
  botUserId = await getBotUserId();
  const wsUrl = MM_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/api/v4/websocket';
  const mmWs = new WebSocket(wsUrl, { headers });

  mmWs.on('open', () => {
    mmWs.send(JSON.stringify({ seq: 1, action: 'authentication_challenge', data: { token: MM_TOKEN } }));
    console.log('[Mattermost] Connected');
  });

  mmWs.on('message', raw => {
    const event = JSON.parse(raw.toString());
    if (event.event !== 'posted') return;
    const post = JSON.parse(event.data?.post || '{}');
    if (post.user_id === botUserId) return;
    const text = post.message?.trim();
    const channelId = post.channel_id;
    const userId = post.user_id;
    if (!text || !channelId) return;

    const ws = getOrCreateSocket(userId, channelId);
    const send = () => ws.send(JSON.stringify({ type: 'message', content: text }));
    if (ws.readyState === WebSocket.OPEN) send();
    else ws.once('open', send);
  });

  mmWs.on('close', () => setTimeout(connect, 5000));
}

connect().catch(console.error);
