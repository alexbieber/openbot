/**
 * Microsoft Teams Channel Adapter
 * Connects a Teams Bot to the OpenBot Gateway via Bot Framework + WebSocket.
 * Run standalone: node gateway/channels/teams.js
 *
 * Setup:
 *   1. Create a bot at https://dev.botframework.com
 *   2. Set TEAMS_APP_ID and TEAMS_APP_PASSWORD
 *   3. Register messaging endpoint: https://your-server/api/messages
 */

import express from 'express';
import { BotFrameworkAdapter, ActivityHandler, TurnContext } from 'botbuilder';
import WebSocket from 'ws';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const AGENT_ID = process.env.AGENT_ID || 'default';
const APP_ID = process.env.TEAMS_APP_ID;
const APP_PASSWORD = process.env.TEAMS_APP_PASSWORD;
const PORT = process.env.TEAMS_PORT || 3978;

if (!APP_ID || !APP_PASSWORD) {
  console.error('[Teams] TEAMS_APP_ID and TEAMS_APP_PASSWORD must be set.');
  process.exit(1);
}

const adapter = new BotFrameworkAdapter({ appId: APP_ID, appPassword: APP_PASSWORD });
const userSockets = new Map();
const pendingContexts = new Map(); // userId → TurnContext

function getOrCreateSocket(userId) {
  if (userSockets.has(userId)) return userSockets.get(userId);

  const ws = new WebSocket(GATEWAY_URL);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'handshake',
      role: 'channel',
      userId: `teams:${userId}`,
      agentId: AGENT_ID,
      channel: 'teams',
    }));
  });

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());
    const ctx = pendingContexts.get(userId);
    if (msg.type === 'message' && msg.content && ctx) {
      try {
        await ctx.sendActivity(msg.content);
      } catch (err) {
        console.error(`[Teams] Reply failed:`, err.message);
      }
    }
  });

  ws.on('close', () => userSockets.delete(userId));
  ws.on('error', () => userSockets.delete(userId));

  userSockets.set(userId, ws);
  return ws;
}

class TeamsBot extends ActivityHandler {
  constructor() {
    super();
    this.onMessage(async (context, next) => {
      const userId = context.activity.from.id;
      const text = context.activity.text?.trim();
      if (!text) return;

      pendingContexts.set(userId, context);
      const ws = getOrCreateSocket(userId);

      const sendMsg = () => ws.send(JSON.stringify({ type: 'message', content: text }));
      if (ws.readyState === WebSocket.OPEN) sendMsg();
      else ws.once('open', sendMsg);

      await next();
    });
  }
}

const bot = new TeamsBot();
const app = express();
app.use(express.json());

app.post('/api/messages', (req, res) => {
  adapter.processActivity(req, res, async (context) => {
    await bot.run(context);
  });
});

app.listen(PORT, () => {
  console.log(`[Teams] Bot listening on port ${PORT}`);
  console.log(`[Teams] Register endpoint: https://your-domain/api/messages`);
});
