/**
 * Discord Channel Adapter
 * Connects a Discord Bot to the OpenBot Gateway.
 */

import { Client, GatewayIntentBits } from 'discord.js';
import WebSocket from 'ws';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const AGENT_ID = process.env.AGENT_ID || 'default';

if (!DISCORD_TOKEN) {
  console.error('[Discord] DISCORD_BOT_TOKEN not set.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
});

const userSockets = new Map();
const pendingMessages = new Map(); // userId → Discord message object (for replies)

function getOrCreateSocket(userId) {
  if (userSockets.has(userId)) return userSockets.get(userId);

  const ws = new WebSocket(GATEWAY_URL);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'handshake',
      role: 'channel',
      userId: `discord:${userId}`,
      agentId: AGENT_ID,
      channel: 'discord',
    }));
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const pending = pendingMessages.get(userId);

    if (msg.type === 'message' && msg.content && pending) {
      // Split long messages
      const chunks = splitMessage(msg.content, 2000);
      chunks.forEach((chunk, i) => {
        if (i === 0) pending.reply(chunk).catch(() => pending.channel.send(chunk));
        else pending.channel.send(chunk);
      });
    }
  });

  ws.on('close', () => userSockets.delete(userId));
  ws.on('error', () => userSockets.delete(userId));

  userSockets.set(userId, ws);
  return ws;
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  while (text.length > 0) {
    chunks.push(text.substring(0, maxLen));
    text = text.substring(maxLen);
  }
  return chunks;
}

client.on('ready', () => {
  console.log(`[Discord] Logged in as ${client.user.tag}`);
  client.user.setActivity('OpenBot — AI Agent');
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Respond to DMs or when mentioned
  const isMentioned = message.mentions.has(client.user);
  const isDM = message.channel.type === 1; // DM channel
  if (!isMentioned && !isDM) return;

  const userId = message.author.id;
  const content = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!content) return;

  pendingMessages.set(userId, message);
  const ws = getOrCreateSocket(userId);

  const sendMsg = () => ws.send(JSON.stringify({ type: 'message', content }));
  if (ws.readyState === WebSocket.OPEN) sendMsg();
  else ws.once('open', sendMsg);

  // Typing indicator
  message.channel.sendTyping().catch(() => {});
});

client.login(DISCORD_TOKEN);
