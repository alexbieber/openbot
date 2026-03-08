/**
 * OpenBot Webhooks System
 * Register webhooks for events: message.received, agent.end, cron.run, custom triggers.
 * Mirrors ClawdBot's automation/webhook.md functionality.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createHmac } from 'crypto';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export class WebhookManager {
  constructor(dataDir) {
    this._file = join(dataDir, 'webhooks.json');
    this._hooks = this._load();
  }

  _load() {
    try {
      if (existsSync(this._file)) return JSON.parse(readFileSync(this._file, 'utf-8'));
    } catch {}
    return [];
  }

  _save() {
    try { writeFileSync(this._file, JSON.stringify(this._hooks, null, 2)); } catch {}
  }

  add(hook) {
    const { url, agentId, secret, enabled = true, label } = hook;
    // Accept both `event` (string) and `events` (array) — normalize to string for storage
    const event = hook.event || (Array.isArray(hook.events) ? hook.events[0] : hook.events);
    if (!url || !event) throw new Error('url and event required');
    const id = uuidv4();
    const entry = { id, url, event, agentId: agentId || '*', secret, enabled, label: label || url, createdAt: new Date().toISOString() };
    this._hooks.push(entry);
    this._save();
    return entry;
  }

  remove(id) {
    const idx = this._hooks.findIndex(h => h.id === id);
    if (idx === -1) throw new Error('not found');
    const [removed] = this._hooks.splice(idx, 1);
    this._save();
    return removed;
  }

  update(id, patch) {
    const hook = this._hooks.find(h => h.id === id);
    if (!hook) throw new Error('not found');
    Object.assign(hook, patch, { id }); // don't override id
    this._save();
    return hook;
  }

  list(event) {
    return event ? this._hooks.filter(h => h.event === event || h.event === '*') : this._hooks;
  }

  get(id) { return this._hooks.find(h => h.id === id); }

  /** Fire all webhooks matching an event */
  async fire(event, payload = {}) {
    const matching = this._hooks.filter(h => h.enabled && (h.event === event || h.event === '*'));
    if (!matching.length) return;

    const body = JSON.stringify({ event, payload, firedAt: new Date().toISOString() });

    await Promise.allSettled(matching.map(async hook => {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (hook.secret) headers['X-OpenBot-Signature'] = this._sign(body, hook.secret);

        const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
        const fetchFn = fetch || globalThis.fetch;
        const res = await fetchFn(hook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
        if (!res.ok) console.warn(`[Webhooks] ${hook.url} returned ${res.status}`);
      } catch (err) {
        console.warn(`[Webhooks] Failed to fire ${hook.url}:`, err.message);
      }
    }));
  }

  _sign(body, secret) {
    return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  }
}
