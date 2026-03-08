/**
 * Nextcloud Talk channel adapter
 * Config: NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASSWORD, NEXTCLOUD_ROOM_TOKEN
 */

import axios from 'axios';

export class NextcloudTalkChannel {
  constructor(config, onMessage) {
    this.config = config;
    this.onMessage = onMessage;
    this.baseUrl = config.url || process.env.NEXTCLOUD_URL;
    this.user = config.user || process.env.NEXTCLOUD_USER;
    this.password = config.password || process.env.NEXTCLOUD_PASSWORD;
    this.roomToken = config.roomToken || process.env.NEXTCLOUD_ROOM_TOKEN;
    this._polling = false;
    this._lastMessageId = 0;
  }

  get name() { return 'nextcloud-talk'; }

  async start() {
    if (!this.baseUrl || !this.user || !this.password) {
      console.log('[Nextcloud Talk] Not configured (set NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASSWORD)');
      return;
    }
    this._polling = true;
    this._poll();
    console.log('[Nextcloud Talk] Started polling');
  }

  async _poll() {
    while (this._polling) {
      try {
        const rooms = await this._getRooms();
        for (const room of rooms) {
          await this._pollRoom(room.token);
        }
      } catch (err) {
        console.error('[Nextcloud Talk] Poll error:', err.message);
      }
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  async _getRooms() {
    const res = await axios.get(`${this.baseUrl}/ocs/v2.php/apps/spreed/api/v4/room`, {
      auth: { username: this.user, password: this.password },
      headers: { 'OCS-APIRequest': 'true', 'Accept': 'application/json' },
    });
    return res.data?.ocs?.data || [];
  }

  async _pollRoom(token) {
    const res = await axios.get(`${this.baseUrl}/ocs/v2.php/apps/spreed/api/v1/chat/${token}`, {
      auth: { username: this.user, password: this.password },
      headers: { 'OCS-APIRequest': 'true', 'Accept': 'application/json' },
      params: { lookIntoFuture: 0, lastKnownMessageId: this._lastMessageId, limit: 20 },
    });
    const messages = res.data?.ocs?.data || [];
    for (const msg of messages) {
      if (msg.id > this._lastMessageId) {
        this._lastMessageId = msg.id;
        if (msg.actorType === 'users' && msg.actorId !== this.user && msg.messageType === 'comment') {
          await this.onMessage({ content: msg.message, userId: msg.actorId, channel: 'nextcloud-talk', roomToken: token });
        }
      }
    }
  }

  async send(token, text) {
    await axios.post(`${this.baseUrl}/ocs/v2.php/apps/spreed/api/v1/chat/${token}`,
      { message: text },
      { auth: { username: this.user, password: this.password }, headers: { 'OCS-APIRequest': 'true' } }
    );
  }

  stop() { this._polling = false; }
  status() { return { connected: this._polling, name: this.name }; }
}
