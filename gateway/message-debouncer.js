/**
 * Message Debouncer — batches rapid inbound messages from the same peer.
 * When multiple messages arrive quickly from the same sender,
 * they are accumulated and sent as a single combined message.
 *
 * Config (per-channel):
 *   channels.debounce.default: 300ms
 *   channels.debounce.telegram: 500ms
 *   channels.debounce.whatsapp: 800ms
 *   channels.debounce.discord: 200ms
 */

export class MessageDebouncer {
  constructor(config = {}) {
    this.config = config;
    this._timers = new Map();
    this._buffers = new Map();
    this._defaults = {
      default: 300,
      telegram: 500,
      whatsapp: 800,
      discord: 200,
      slack: 300,
      matrix: 400,
      irc: 600,
    };
  }

  _getDelay(channel) {
    const cfg = this.config?.channels?.debounce;
    if (cfg === false || cfg === 0) return 0; // Disabled
    return (typeof cfg === 'object' ? cfg[channel] : undefined)
      ?? (typeof cfg === 'number' ? cfg : undefined)
      ?? this._defaults[channel]
      ?? this._defaults.default;
  }

  _key(channel, peerId) {
    return `${channel}:${peerId}`;
  }

  /**
   * Enqueue a message. Calls `onFlush` after debounce delay with combined message.
   * If delay is 0, calls onFlush immediately.
   */
  enqueue(msg, onFlush) {
    const { channel, peerId, content } = msg;
    const delay = this._getDelay(channel);

    if (delay === 0) {
      onFlush(msg);
      return;
    }

    const key = this._key(channel, peerId);

    // Buffer the message content
    if (!this._buffers.has(key)) {
      this._buffers.set(key, { msgs: [], first: msg });
    }
    this._buffers.get(key).msgs.push(content);

    // Reset debounce timer
    if (this._timers.has(key)) clearTimeout(this._timers.get(key));

    this._timers.set(key, setTimeout(() => {
      const buf = this._buffers.get(key);
      this._timers.delete(key);
      this._buffers.delete(key);
      if (!buf) return;

      // Combine messages
      const combined = buf.msgs.length === 1
        ? buf.first
        : { ...buf.first, content: buf.msgs.join('\n'), debounced: buf.msgs.length };

      onFlush(combined);
    }, delay));
  }

  /**
   * Flush all pending buffers immediately (on shutdown).
   */
  flushAll(onFlush) {
    for (const [key, timer] of this._timers) {
      clearTimeout(timer);
      const buf = this._buffers.get(key);
      if (buf) {
        const combined = buf.msgs.length === 1
          ? buf.first
          : { ...buf.first, content: buf.msgs.join('\n'), debounced: buf.msgs.length };
        onFlush(combined);
      }
    }
    this._timers.clear();
    this._buffers.clear();
  }

  stats() {
    return { pending: this._timers.size, buffered: this._buffers.size };
  }
}
