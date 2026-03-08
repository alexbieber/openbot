/**
 * Twitch Chat channel adapter (IRC-based)
 * Config: TWITCH_CHANNEL, TWITCH_BOT_USERNAME, TWITCH_BOT_OAUTH
 * Use "!openbot <message>" to trigger the AI.
 */

import { createConnection } from 'net';

export class TwitchChannel {
  constructor(config, onMessage) {
    this.config = config;
    this.onMessage = onMessage;
    this.channel = (config.channel || process.env.TWITCH_CHANNEL || '').toLowerCase().replace('#', '');
    this.username = config.botUsername || process.env.TWITCH_BOT_USERNAME;
    this.oauth = config.oauth || process.env.TWITCH_BOT_OAUTH;
    this.prefix = config.prefix || '!openbot';
    this._socket = null;
    this._connected = false;
    this._reconnectDelay = 5000;
  }

  get name() { return 'twitch'; }

  async start() {
    if (!this.channel || !this.username || !this.oauth) {
      console.log('[Twitch] Not configured (set TWITCH_CHANNEL, TWITCH_BOT_USERNAME, TWITCH_BOT_OAUTH)');
      return;
    }
    this._connect();
  }

  _connect() {
    const socket = createConnection({ host: 'irc.chat.twitch.tv', port: 6667 });
    this._socket = socket;

    socket.on('connect', () => {
      socket.write(`PASS ${this.oauth.startsWith('oauth:') ? this.oauth : 'oauth:' + this.oauth}\r\n`);
      socket.write(`NICK ${this.username}\r\n`);
      socket.write(`JOIN #${this.channel}\r\n`);
      this._connected = true;
      console.log(`[Twitch] Connected to #${this.channel}`);
    });

    let buf = '';
    socket.on('data', (data) => {
      buf += data.toString();
      const lines = buf.split('\r\n');
      buf = lines.pop();
      for (const line of lines) {
        if (line.startsWith('PING')) { socket.write('PONG :tmi.twitch.tv\r\n'); continue; }
        this._parseLine(line);
      }
    });

    socket.on('close', () => {
      this._connected = false;
      console.log('[Twitch] Disconnected, reconnecting...');
      setTimeout(() => this._connect(), this._reconnectDelay);
    });

    socket.on('error', (err) => {
      console.error('[Twitch] Error:', err.message);
    });
  }

  _parseLine(line) {
    // :username!username@username.tmi.twitch.tv PRIVMSG #channel :message
    const match = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #(\w+) :(.+)/);
    if (!match) return;
    const [, user, , text] = match;
    if (user === this.username) return; // ignore self
    if (!text.startsWith(this.prefix)) return;
    const content = text.slice(this.prefix.length).trim();
    if (!content) return;
    this.onMessage({ content, userId: user, channel: 'twitch', room: this.channel });
  }

  async send(text) {
    if (!this._connected || !this._socket) return;
    // Split long messages
    const chunks = text.match(/.{1,500}/g) || [text];
    for (const chunk of chunks) {
      this._socket.write(`PRIVMSG #${this.channel} :${chunk}\r\n`);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  stop() {
    this._socket?.destroy();
    this._connected = false;
  }

  status() { return { connected: this._connected, channel: this.channel, name: this.name }; }
}
