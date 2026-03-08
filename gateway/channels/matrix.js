/**
 * Matrix Channel Adapter
 * Connects a Matrix bot to the OpenBot Gateway via WebSocket.
 * Works with any Matrix homeserver (matrix.org, Element, etc.)
 * Run standalone: node gateway/channels/matrix.js
 */

import sdk from 'matrix-js-sdk';
import WebSocket from 'ws';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const AGENT_ID = process.env.AGENT_ID || 'default';
const MATRIX_HOMESERVER = process.env.MATRIX_HOMESERVER || 'https://matrix.org';
const MATRIX_ACCESS_TOKEN = process.env.MATRIX_ACCESS_TOKEN;
const MATRIX_USER_ID = process.env.MATRIX_USER_ID;

if (!MATRIX_ACCESS_TOKEN || !MATRIX_USER_ID) {
  console.error('[Matrix] MATRIX_ACCESS_TOKEN and MATRIX_USER_ID must be set.');
  process.exit(1);
}

const matrixClient = sdk.createClient({
  baseUrl: MATRIX_HOMESERVER,
  accessToken: MATRIX_ACCESS_TOKEN,
  userId: MATRIX_USER_ID,
});

const userSockets = new Map(); // roomId → WebSocket
const pendingReply = new Map(); // roomId → roomId

function getOrCreateSocket(roomId) {
  if (userSockets.has(roomId)) return userSockets.get(roomId);

  const ws = new WebSocket(GATEWAY_URL);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'handshake',
      role: 'channel',
      userId: `matrix:${roomId}`,
      agentId: AGENT_ID,
      channel: 'matrix',
    }));
  });

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'message' && msg.content) {
      try {
        await matrixClient.sendTextMessage(roomId, msg.content);
      } catch (err) {
        console.error(`[Matrix] Failed to send message to ${roomId}:`, err.message);
      }
    }
  });

  ws.on('close', () => userSockets.delete(roomId));
  ws.on('error', () => userSockets.delete(roomId));

  userSockets.set(roomId, ws);
  return ws;
}

matrixClient.on('Room.timeline', (event, room) => {
  if (event.getType() !== 'm.room.message') return;
  if (event.getSender() === MATRIX_USER_ID) return; // ignore own messages

  const content = event.getContent();
  if (content.msgtype !== 'm.text') return;

  const roomId = room.roomId;
  const text = content.body;

  const ws = getOrCreateSocket(roomId);
  const sendMsg = () => ws.send(JSON.stringify({ type: 'message', content: text }));
  if (ws.readyState === WebSocket.OPEN) sendMsg();
  else ws.once('open', sendMsg);
});

matrixClient.on('RoomMember.membership', async (event, member) => {
  if (member.membership === 'invite' && member.userId === MATRIX_USER_ID) {
    console.log(`[Matrix] Joining room: ${member.roomId}`);
    await matrixClient.joinRoom(member.roomId);
  }
});

matrixClient.startClient({ initialSyncLimit: 10 });
console.log('[Matrix] Channel adapter running. Ctrl+C to stop.');
