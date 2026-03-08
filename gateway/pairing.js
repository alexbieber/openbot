/**
 * DM Pairing System
 * Matches OpenClaw's gateway-owned pairing: unknown senders get a pairing code
 * and can't interact with the agent until they enter the correct code.
 *
 * Modes:
 *   "open"      — anyone can DM (dangerous)
 *   "pairing"   — new senders must enter a 6-digit code (default, secure)
 *   "allowlist" — only pre-approved user IDs can interact
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomInt } from 'crypto';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const PAIRING_FILE = join(HOME, '.openbot', 'pairing.json');
mkdirSync(join(HOME, '.openbot'), { recursive: true });

export class PairingManager {
  constructor(policy = 'pairing') {
    this.policy = policy;
    this.data = this._load();
  }

  _load() {
    if (!existsSync(PAIRING_FILE)) return { allowlist: [], pending: {} };
    try { return JSON.parse(readFileSync(PAIRING_FILE, 'utf-8')); } catch { return { allowlist: [], pending: {} }; }
  }

  _save() {
    writeFileSync(PAIRING_FILE, JSON.stringify(this.data, null, 2));
  }

  /**
   * Check if userId is allowed to interact.
   * Returns { allowed: bool, message?: string (to send to user) }
   */
  check(userId, channel, text) {
    if (this.policy === 'open') return { allowed: true };
    if (this.policy === 'allowlist') {
      return this.data.allowlist.includes(userId)
        ? { allowed: true }
        : { allowed: false, message: 'You are not on the allowlist. Contact the owner to get access.' };
    }

    // pairing mode
    if (this.data.allowlist.includes(userId)) return { allowed: true };

    const pending = this.data.pending[userId];

    // User is entering a pairing code
    const codeMatch = text?.trim().match(/^\d{6}$/);
    if (codeMatch && pending) {
      if (Date.now() > pending.expiresAt) {
        delete this.data.pending[userId];
        this._save();
        return { allowed: false, message: 'Pairing code expired. Type anything to get a new code.' };
      }
      if (text.trim() === pending.code) {
        this.data.allowlist.push(userId);
        delete this.data.pending[userId];
        this._save();
        return { allowed: true, message: '✓ Paired successfully! You can now chat with OpenBot.' };
      }
      return { allowed: false, message: 'Incorrect code. Try again or type anything to get a new code.' };
    }

    // Generate new pairing code
    const code = String(randomInt(100000, 999999));
    this.data.pending[userId] = { code, channel, issuedAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000 };
    this._save();

    return {
      allowed: false,
      message: `👋 Hi! I'm OpenBot.\n\nTo prevent spam, new contacts need a pairing code.\n\n**Your code: \`${code}\`**\n\nAsk the owner for this code, then send it here. Code expires in 10 minutes.`,
    };
  }

  allow(userId) {
    if (!this.data.allowlist.includes(userId)) {
      this.data.allowlist.push(userId);
      this._save();
    }
  }

  deny(userId) {
    this.data.allowlist = this.data.allowlist.filter(id => id !== userId);
    delete this.data.pending[userId];
    this._save();
  }

  listAllowed() { return this.data.allowlist; }
  listPending() {
    return Object.entries(this.data.pending).map(([userId, p]) => ({
      userId, channel: p.channel, issuedAt: new Date(p.issuedAt).toISOString(),
      expiresAt: new Date(p.expiresAt).toISOString(),
    }));
  }

  setPolicy(policy) {
    this.policy = policy;
  }
}
