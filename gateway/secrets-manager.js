/**
 * Secrets Manager
 * Tiered storage: OS Keychain (keytar) → AES-256-GCM file → env vars.
 *
 * Tier 1 (best): OS-native keychain via `keytar`
 *   macOS:   Keychain Access (secure enclave)
 *   Windows: DPAPI / Credential Manager
 *   Linux:   libsecret / KWallet
 *
 * Tier 2: AES-256-GCM encrypted file at ~/.openbot/credentials/
 * Tier 3: process.env fallback (plain text, least secure)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const CREDS_DIR = join(HOME, '.openbot', 'credentials');
const SECRETS_FILE = join(CREDS_DIR, 'secrets.enc.json');
const SALT_FILE = join(CREDS_DIR, '.salt');
const KEYCHAIN_SERVICE = 'openbot';

mkdirSync(CREDS_DIR, { recursive: true });
try { chmodSync(CREDS_DIR, 0o700); } catch {} // restrict access

// Lazy-load keytar (optional native module)
let _keytar = null;
async function getKeytar() {
  if (_keytar !== null) return _keytar;
  try {
    _keytar = await import('keytar').then(m => m.default || m);
  } catch {
    _keytar = false; // not installed
  }
  return _keytar;
}

export class SecretsManager {
  constructor(masterPassword) {
    this.key = this._deriveKey(masterPassword || this._getMachineId());
    this.secrets = this._load();
    this._keychainAvailable = null;
  }

  async _isKeychainAvailable() {
    if (this._keychainAvailable !== null) return this._keychainAvailable;
    const kt = await getKeytar();
    this._keychainAvailable = !!kt;
    return this._keychainAvailable;
  }

  /** Store in OS keychain (async, silent fallback) */
  async setSecure(key, value) {
    const kt = await getKeytar();
    if (kt) {
      try {
        await kt.setPassword(KEYCHAIN_SERVICE, key, value);
        return true;
      } catch {}
    }
    // Fall back to encrypted file
    this.set(key, value);
    return false;
  }

  /** Get from OS keychain first, then encrypted file, then env */
  async getSecure(key) {
    const kt = await getKeytar();
    if (kt) {
      try {
        const val = await kt.getPassword(KEYCHAIN_SERVICE, key);
        if (val) return val;
      } catch {}
    }
    return this.get(key);
  }

  /** Delete from OS keychain and encrypted file */
  async deleteSecure(key) {
    const kt = await getKeytar();
    if (kt) {
      try { await kt.deletePassword(KEYCHAIN_SERVICE, key); } catch {}
    }
    this.delete(key);
  }

  /** List all keychain entries for openbot */
  async listKeychain() {
    const kt = await getKeytar();
    if (!kt) return [];
    try {
      return await kt.findCredentials(KEYCHAIN_SERVICE);
    } catch { return []; }
  }

  keychainStatus() {
    return { available: this._keychainAvailable ?? 'unknown', service: KEYCHAIN_SERVICE };
  }

  _getMachineId() {
    // Derive a machine-specific key from hostname + platform
    return `openbot-${process.env.COMPUTERNAME || process.env.HOSTNAME || 'local'}-${process.platform}`;
  }

  _deriveKey(password) {
    let salt;
    if (existsSync(SALT_FILE)) {
      salt = readFileSync(SALT_FILE);
    } else {
      salt = randomBytes(32);
      writeFileSync(SALT_FILE, salt);
      try { chmodSync(SALT_FILE, 0o600); } catch {}
    }
    return scryptSync(password, salt, 32);
  }

  _encrypt(text) {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { iv: iv.toString('hex'), tag: tag.toString('hex'), data: encrypted.toString('hex') };
  }

  _decrypt(obj) {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(obj.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(obj.tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(obj.data, 'hex')), decipher.final()]).toString('utf-8');
  }

  _load() {
    if (!existsSync(SECRETS_FILE)) return {};
    try {
      const raw = JSON.parse(readFileSync(SECRETS_FILE, 'utf-8'));
      const decrypted = {};
      for (const [k, v] of Object.entries(raw)) {
        try { decrypted[k] = this._decrypt(v); } catch { /* skip corrupted */ }
      }
      return decrypted;
    } catch { return {}; }
  }

  _save() {
    const encrypted = {};
    for (const [k, v] of Object.entries(this.secrets)) {
      encrypted[k] = this._encrypt(v);
    }
    writeFileSync(SECRETS_FILE, JSON.stringify(encrypted, null, 2));
    try { chmodSync(SECRETS_FILE, 0o600); } catch {}
  }

  set(key, value) {
    this.secrets[key] = value;
    this._save();
    process.env[key] = value; // inject into env immediately
  }

  get(key) {
    return this.secrets[key] || process.env[key] || null;
  }

  list() {
    const combined = { ...this.secrets };
    // Merge env vars (mask values)
    for (const key of Object.keys(process.env)) {
      if (key.includes('API_KEY') || key.includes('TOKEN') || key.includes('SECRET')) {
        if (!combined[key]) combined[key] = process.env[key];
      }
    }
    return Object.keys(combined).map(k => ({
      key: k,
      source: this.secrets[k] ? 'secrets' : 'env',
      masked: (combined[k] || '').substring(0, 4) + '****',
    }));
  }

  delete(key) {
    delete this.secrets[key];
    this._save();
  }

  // Inject all stored secrets into process.env at startup
  injectAll() {
    for (const [k, v] of Object.entries(this.secrets)) {
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
