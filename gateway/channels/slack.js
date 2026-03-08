/**
 * Slack Channel Adapter
 * Connects a Slack App to the OpenBot Gateway via Socket Mode.
 */

import { App } from '@slack/bolt';
import WebSocket from 'ws';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const AGENT_ID = process.env.AGENT_ID || 'default';

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const userSockets = new Map();

function getOrCreateSocket(userId) {
  if (userSockets.has(userId)) return userSockets.get(userId);

  const ws = new WebSocket(GATEWAY_URL);
  let pendingResolve = null;

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'handshake',
      role: 'channel',
      userId: `slack:${userId}`,
      agentId: AGENT_ID,
      channel: 'slack',
    }));
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'message' && pendingResolve) {
      pendingResolve(msg.content);
      pendingResolve = null;
    }
  });

  ws.on('close', () => userSockets.delete(userId));
  ws.on('error', () => userSockets.delete(userId));

  ws._setPendingResolve = (fn) => { pendingResolve = fn; };
  userSockets.set(userId, ws);
  return ws;
}

async function askAgent(userId, text) {
  return new Promise((resolve, reject) => {
    const ws = getOrCreateSocket(userId);
    ws._setPendingResolve(resolve);
    setTimeout(() => reject(new Error('Timeout')), 60000);
    const send = () => ws.send(JSON.stringify({ type: 'message', content: text }));
    if (ws.readyState === WebSocket.OPEN) send();
    else ws.once('open', send);
  });
}

// Handle app mentions
slackApp.event('app_mention', async ({ event, say }) => {
  const text = event.text.replace(/<@\w+>/g, '').trim();
  if (!text) return say('How can I help you?');
  try {
    const response = await askAgent(event.user, text);
    await say({ text: response, thread_ts: event.ts });
  } catch (err) {
    await say(`⚠️ ${err.message}`);
  }
});

// Handle DMs
slackApp.message(async ({ message, say }) => {
  if (message.channel_type !== 'im') return;
  try {
    const response = await askAgent(message.user, message.text);
    await say(response);
  } catch (err) {
    await say(`⚠️ ${err.message}`);
  }
});

(async () => {
  await slackApp.start();
  console.log('[Slack] Channel adapter running');
})();
