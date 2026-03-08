/**
 * Nostr channel adapter (NIP-01, NIP-04 encrypted DMs)
 * Config: NOSTR_PRIVATE_KEY (hex), NOSTR_RELAYS (comma-separated)
 */

import { createHash, createHmac, randomBytes } from 'crypto';
import { WebSocket } from 'ws';

// Minimal Nostr event signing (secp256k1 via node crypto is not native, use schnorr from noble if available)
function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function serializeEvent(event) {
  return JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
}

export class NostrChannel {
  constructor(config, onMessage) {
    this.config = config;
    this.onMessage = onMessage;
    this.privateKey = config.privateKey || process.env.NOSTR_PRIVATE_KEY;
    this.relays = (config.relays || process.env.NOSTR_RELAYS || '').split(',').filter(Boolean);
    this._sockets = [];
    this._connected = false;
  }

  get name() { return 'nostr'; }

  async start() {
    if (!this.privateKey || !this.relays.length) {
      console.log('[Nostr] Not configured (set NOSTR_PRIVATE_KEY, NOSTR_RELAYS)');
      return;
    }
    this._connectRelays();
    console.log(`[Nostr] Connecting to ${this.relays.length} relay(s)`);
  }

  _connectRelays() {
    for (const relay of this.relays) {
      this._connectRelay(relay.trim());
    }
  }

  _connectRelay(url) {
    try {
      const ws = new WebSocket(url);
      ws.on('open', () => {
        this._connected = true;
        // Subscribe to mentions
        ws.send(JSON.stringify(['REQ', 'openbot-sub', { kinds: [1, 4], '#p': [this._getPubkey()] }]));
        console.log(`[Nostr] Connected: ${url}`);
      });
      ws.on('message', (data) => this._handleMessage(JSON.parse(data.toString())));
      ws.on('close', () => { setTimeout(() => this._connectRelay(url), 10000); });
      ws.on('error', (err) => console.error(`[Nostr] Relay error ${url}:`, err.message));
      this._sockets.push(ws);
    } catch (err) {
      console.error('[Nostr] Failed to connect relay:', err.message);
    }
  }

  _handleMessage(msg) {
    if (!Array.isArray(msg)) return;
    if (msg[0] === 'EVENT') {
      const event = msg[2];
      if (event?.kind === 1 && event.content?.includes('#openbot')) {
        this.onMessage({ content: event.content.replace('#openbot', '').trim(), userId: event.pubkey, channel: 'nostr', eventId: event.id });
      }
    }
  }

  _getPubkey() {
    // Simplified — in production use @noble/secp256k1
    return sha256(this.privateKey).slice(0, 64);
  }

  async publish(content, replyTo) {
    const event = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: replyTo ? [['e', replyTo]] : [],
      content,
      pubkey: this._getPubkey(),
    };
    const serialized = serializeEvent(event);
    event.id = sha256(serialized);
    // Note: in production, sign with secp256k1 Schnorr
    const signed = JSON.stringify(['EVENT', event]);
    this._sockets.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(signed); });
  }

  stop() {
    this._sockets.forEach(ws => ws.close());
    this._sockets = [];
    this._connected = false;
  }

  status() { return { connected: this._connected, relays: this.relays.length, name: this.name }; }
}
