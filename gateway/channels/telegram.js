/**
 * Telegram Channel Adapter
 * Connects a Telegram Bot to the OpenBot Gateway via WebSocket.
 * Run standalone: node gateway/channels/telegram.js
 */

import TelegramBot from 'node-telegram-bot-api';
import WebSocket from 'ws';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const AGENT_ID = process.env.AGENT_ID || 'default';

if (!BOT_TOKEN) {
  console.error('[Telegram] TELEGRAM_BOT_TOKEN not set. Export it and restart.');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const userSockets = new Map(); // chatId → WebSocket

function getOrCreateSocket(chatId) {
  if (userSockets.has(chatId)) return userSockets.get(chatId);

  const ws = new WebSocket(GATEWAY_URL);

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'handshake',
      role: 'channel',
      userId: `telegram:${chatId}`,
      agentId: AGENT_ID,
      channel: 'telegram',
    }));
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'message' && msg.content) {
      bot.sendMessage(chatId, msg.content, { parse_mode: 'Markdown' })
        .catch(() => bot.sendMessage(chatId, msg.content)); // fallback without markdown
    }

    if (msg.type === 'typing' && msg.typing) {
      bot.sendChatAction(chatId, 'typing').catch(() => {});
    }

    if (msg.type === 'error') {
      bot.sendMessage(chatId, `⚠️ Error: ${msg.error}`).catch(() => {});
    }
  });

  ws.on('close', () => {
    userSockets.delete(chatId);
    console.log(`[Telegram] Socket closed for ${chatId}`);
  });

  ws.on('error', (err) => {
    console.error(`[Telegram] Socket error for ${chatId}:`, err.message);
    userSockets.delete(chatId);
  });

  userSockets.set(chatId, ws);
  return ws;
}

// ── Bot Handlers ─────────────────────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `*OpenBot is ready!*\n\nI'm your personal AI agent. Just message me anything and I'll help you get things done.\n\nType /help for commands.`, { parse_mode: 'Markdown' });
  getOrCreateSocket(chatId); // pre-connect
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, `*OpenBot Commands*\n\n/start — Initialize\n/memory — List memories\n/clear — Clear conversation\n/status — Check gateway status\n/help — Show this message\n\nOr just chat naturally! 💬`, { parse_mode: 'Markdown' });
});

bot.onText(/\/memory/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const res = await fetch(`http://127.0.0.1:18789/memory`);
    const memories = await res.json();
    if (!memories.length) return bot.sendMessage(chatId, '🧠 No memories stored yet.');
    const text = memories.slice(0, 10).map((m, i) => `${i + 1}. ${m.content.substring(0, 100)}`).join('\n');
    bot.sendMessage(chatId, `*Your Memories:*\n\n${text}`, { parse_mode: 'Markdown' });
  } catch {
    bot.sendMessage(chatId, '⚠️ Could not fetch memories.');
  }
});

bot.onText(/\/status/, async (msg) => {
  try {
    const res = await fetch('http://127.0.0.1:18789/health');
    const health = await res.json();
    bot.sendMessage(msg.chat.id, `✅ Gateway running\n🤖 Model: ${health.model}\n📡 Channels: ${health.connectedChannels}\n⏱ Uptime: ${Math.round(health.uptime)}s`, { parse_mode: 'Markdown' });
  } catch {
    bot.sendMessage(msg.chat.id, '⚠️ Gateway unreachable. Is it running?');
  }
});

// Handle all regular messages
bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const ws = getOrCreateSocket(chatId);

  const sendMsg = () => {
    ws.send(JSON.stringify({ type: 'message', content: msg.text }));
  };

  if (ws.readyState === WebSocket.OPEN) {
    sendMsg();
  } else {
    ws.once('open', sendMsg);
  }
});

console.log('🤖 Telegram channel adapter running. Ctrl+C to stop.');
