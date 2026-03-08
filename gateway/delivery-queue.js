/**
 * Delivery Queue — hardened outbound message queue with exponential backoff retry.
 * Ensures messages reach their destination even across transient channel failures.
 *
 * Features:
 * - Per-lane (channel:accountId) serialization
 * - Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s cap
 * - Max 5 retries per message
 * - Dead-letter queue for persistently failed messages
 * - Drain on shutdown
 * - Metrics: success/failure/retry counts
 */

import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 30000;
const DRAIN_TIMEOUT_MS = 10000;

function backoff(attempt) {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_CAP_MS);
}

class DeliveryEntry {
  constructor({ id, lane, payload, sender, createdAt }) {
    this.id = id;
    this.lane = lane;
    this.payload = payload;
    this.sender = sender;
    this.createdAt = createdAt || Date.now();
    this.attempts = 0;
    this.lastAttemptAt = 0;
    this.nextAttemptAt = Date.now();
    this.lastError = null;
    this.status = 'pending'; // pending | sending | failed | dead
  }

  isEligible() {
    return this.status === 'pending' && Date.now() >= this.nextAttemptAt;
  }

  recordFailure(error) {
    this.attempts++;
    this.lastAttemptAt = Date.now();
    this.lastError = error?.message || String(error);
    this.status = this.attempts >= MAX_RETRIES ? 'dead' : 'pending';
    this.nextAttemptAt = Date.now() + backoff(this.attempts);
  }

  recordSuccess() {
    this.attempts++;
    this.lastAttemptAt = Date.now();
    this.status = 'sent';
  }
}

export class DeliveryQueue {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this._lanes = new Map(); // lane → DeliveryEntry[]
    this._deadLetters = [];
    this._metrics = { sent: 0, failed: 0, retried: 0, dead: 0 };
    this._running = false;
    this._timer = null;

    if (dataDir) {
      mkdirSync(join(dataDir, 'delivery'), { recursive: true });
    }
  }

  /**
   * Enqueue a message for delivery.
   * @param {string} lane - e.g. "telegram:123456" or "discord:guild/channel"
   * @param {object} payload - message to deliver
   * @param {function} sender - async function(payload) that sends the message
   */
  enqueue(lane, payload, sender) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = new DeliveryEntry({ id, lane, payload, sender });

    if (!this._lanes.has(lane)) this._lanes.set(lane, []);
    this._lanes.get(lane).push(entry);

    this._scheduleNext();
    return id;
  }

  /**
   * Attempt delivery for all eligible entries.
   */
  async _drain() {
    if (!this._running) return;

    for (const [lane, entries] of this._lanes) {
      // Process one eligible entry per lane at a time
      const eligible = entries.find(e => e.isEligible());
      if (!eligible) continue;

      eligible.status = 'sending';

      try {
        await eligible.sender(eligible.payload);
        eligible.recordSuccess();
        this._metrics.sent++;

        // Remove from queue
        const idx = entries.indexOf(eligible);
        if (idx !== -1) entries.splice(idx, 1);
        if (entries.length === 0) this._lanes.delete(lane);

      } catch (err) {
        eligible.recordFailure(err);

        if (eligible.status === 'dead') {
          this._metrics.dead++;
          this._deadLetters.push({
            ...eligible,
            diedAt: new Date().toISOString(),
          });
          // Remove from queue
          const idx = entries.indexOf(eligible);
          if (idx !== -1) entries.splice(idx, 1);

          console.warn(`[DeliveryQueue] Dead letter: lane=${lane} id=${eligible.id} error=${eligible.lastError}`);
          this._persistDeadLetter(eligible);
        } else {
          this._metrics.retried++;
          console.warn(`[DeliveryQueue] Retry ${eligible.attempts}/${MAX_RETRIES} lane=${lane} in ${backoff(eligible.attempts)}ms: ${eligible.lastError}`);
        }
      }
    }

    this._scheduleNext();
  }

  _scheduleNext() {
    if (this._timer) return;

    // Find the earliest next attempt time
    let soonest = Infinity;
    for (const entries of this._lanes.values()) {
      for (const e of entries) {
        if (e.status === 'pending') soonest = Math.min(soonest, e.nextAttemptAt);
      }
    }

    if (soonest === Infinity) return;

    const delay = Math.max(0, soonest - Date.now());
    this._timer = setTimeout(() => {
      this._timer = null;
      this._drain();
    }, delay);
  }

  _persistDeadLetter(entry) {
    if (!this.dataDir) return;
    try {
      const path = join(this.dataDir, 'delivery', `dead-${entry.id}.json`);
      writeFileSync(path, JSON.stringify({
        id: entry.id, lane: entry.lane, payload: entry.payload,
        attempts: entry.attempts, lastError: entry.lastError, diedAt: new Date().toISOString(),
      }, null, 2));
    } catch {}
  }

  start() {
    this._running = true;
    this._drain();
  }

  async stop() {
    this._running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }

    // Drain remaining entries synchronously (best-effort, short timeout)
    const deadline = Date.now() + DRAIN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      let hasPending = false;
      for (const entries of this._lanes.values()) {
        if (entries.some(e => e.status === 'pending')) { hasPending = true; break; }
      }
      if (!hasPending) break;
      await new Promise(r => setTimeout(r, 100));
    }
  }

  /**
   * Send immediately (bypassing queue) with retry on failure.
   */
  async sendWithRetry(lane, payload, sender) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await sender(payload);
        this._metrics.sent++;
        return { ok: true, attempts: attempt + 1 };
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          this._metrics.failed++;
          return { ok: false, error: err.message, attempts: attempt + 1 };
        }
        const delay = backoff(attempt);
        await new Promise(r => setTimeout(r, delay));
        this._metrics.retried++;
      }
    }
  }

  status() {
    let pending = 0, sending = 0;
    for (const entries of this._lanes.values()) {
      for (const e of entries) {
        if (e.status === 'pending') pending++;
        if (e.status === 'sending') sending++;
      }
    }
    return {
      lanes: this._lanes.size,
      pending,
      sending,
      deadLetters: this._deadLetters.length,
      metrics: { ...this._metrics },
    };
  }

  getDeadLetters() { return [...this._deadLetters]; }
  clearDeadLetters() { this._deadLetters = []; }
}
