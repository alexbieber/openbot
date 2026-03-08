/**
 * Synology Chat channel adapter
 * Config: SYNOLOGY_CHAT_URL (incoming webhook), SYNOLOGY_CHAT_TOKEN
 * Synology Chat sends webhooks via POST to your bot endpoint.
 */

import express from 'express';
import axios from 'axios';

export class SynologyChatChannel {
  constructor(config, onMessage) {
    this.config = config;
    this.onMessage = onMessage;
    this.webhookUrl = config.webhookUrl || process.env.SYNOLOGY_CHAT_URL;
    this.token = config.token || process.env.SYNOLOGY_CHAT_TOKEN;
    this.port = config.port || parseInt(process.env.SYNOLOGY_CHAT_PORT || '8097');
    this._server = null;
    this._connected = false;
  }

  get name() { return 'synology-chat'; }

  async start() {
    if (!this.webhookUrl) {
      console.log('[Synology Chat] Not configured (set SYNOLOGY_CHAT_URL)');
      return;
    }

    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    app.post('/synology-chat', (req, res) => {
      res.sendStatus(200);
      const { text, user_id, username, token } = req.body;
      if (this.token && token !== this.token) return;
      if (!text) return;
      this.onMessage({ content: text, userId: user_id || username || 'user', channel: 'synology-chat' });
    });

    this._server = app.listen(this.port, () => {
      this._connected = true;
      console.log(`[Synology Chat] Webhook server on port ${this.port}`);
    });
  }

  async send(text) {
    if (!this.webhookUrl) return;
    await axios.post(this.webhookUrl, `payload=${encodeURIComponent(JSON.stringify({ text }))}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  }

  stop() {
    this._server?.close();
    this._connected = false;
  }

  status() { return { connected: this._connected, name: this.name }; }
}
