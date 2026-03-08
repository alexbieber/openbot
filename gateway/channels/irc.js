/**
 * IRC Channel Adapter
 * Connects IRC to OpenBot Gateway.
 * Run standalone: node gateway/channels/irc.js
 *
 * Setup:
 *   Set IRC_SERVER, IRC_PORT, IRC_NICK, IRC_CHANNEL(s)
 *   Optionally: IRC_PASSWORD (NickServ), IRC_USE_TLS
 */

import net from 'net';
import tls from 'tls';
import WebSocket from 'ws';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const AGENT_ID = process.env.AGENT_ID || 'default';
const IRC_SERVER = process.env.IRC_SERVER || 'irc.libera.chat';
const IRC_PORT = parseInt(process.env.IRC_PORT || '6697');
const IRC_NICK = process.env.IRC_NICK || 'openbot';
const IRC_CHANNELS = (process.env.IRC_CHANNEL || '#openbot').split(',').map(c => c.trim());
const IRC_PASSWORD = process.env.IRC_PASSWORD || '';
const USE_TLS = process.env.IRC_USE_TLS !== 'false';

const userSockets = new Map();
let ircSocket;

function getOrCreateGwSocket(nick) {
  if (userSockets.has(nick)) return userSockets.get(nick);
  const ws = new WebSocket(GATEWAY_URL);
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'handshake', role: 'channel', userId: `irc:${nick}`, agentId: AGENT_ID, channel: 'irc' }));
  });
  ws.on('message', raw => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'message' && msg.content) {
      // Reply to the channel where the message came from
      const channel = userSockets.get(`${nick}:channel`) || IRC_CHANNELS[0];
      sendIrc(`PRIVMSG ${channel} :${msg.content.replace(/\n/g, ' | ')}`);
    }
  });
  ws.on('close', () => userSockets.delete(nick));
  userSockets.set(nick, ws);
  return ws;
}

function sendIrc(line) {
  if (ircSocket?.writable) ircSocket.write(line + '\r\n');
}

function connect() {
  const sock = USE_TLS
    ? tls.connect(IRC_PORT, IRC_SERVER, { rejectUnauthorized: false })
    : net.connect(IRC_PORT, IRC_SERVER);

  ircSocket = sock;
  let buffer = '';

  sock.on('connect', () => {
    console.log(`[IRC] Connected to ${IRC_SERVER}:${IRC_PORT}`);
    if (IRC_PASSWORD) sendIrc(`PASS ${IRC_PASSWORD}`);
    sendIrc(`NICK ${IRC_NICK}`);
    sendIrc(`USER ${IRC_NICK} 0 * :OpenBot`);
  });

  sock.on('data', data => {
    buffer += data.toString();
    const lines = buffer.split('\r\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('PING')) {
        sendIrc('PONG ' + line.slice(5));
        continue;
      }
      if (line.includes('001 ')) {
        IRC_CHANNELS.forEach(ch => sendIrc(`JOIN ${ch}`));
        console.log(`[IRC] Joined: ${IRC_CHANNELS.join(', ')}`);
        continue;
      }
      const privmsgMatch = line.match(/^:([^!]+)![^ ]+ PRIVMSG ([^ ]+) :(.+)$/);
      if (privmsgMatch) {
        const [, nick, target, text] = privmsgMatch;
        if (nick === IRC_NICK) continue;
        const isChannel = target.startsWith('#');
        const replyTarget = isChannel ? target : nick;
        if (isChannel && !text.toLowerCase().includes(IRC_NICK.toLowerCase())) continue;

        userSockets.set(`${nick}:channel`, replyTarget);
        const ws = getOrCreateGwSocket(nick);
        const clean = text.replace(new RegExp(`${IRC_NICK}[,:]?\\s*`, 'i'), '').trim();
        const send = () => ws.send(JSON.stringify({ type: 'message', content: clean }));
        if (ws.readyState === WebSocket.OPEN) send();
        else ws.once('open', send);
      }
    }
  });

  sock.on('close', () => {
    console.log('[IRC] Disconnected, reconnecting in 10s...');
    setTimeout(connect, 10000);
  });
  sock.on('error', err => console.error('[IRC] Error:', err.message));
}

connect();
