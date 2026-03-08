/**
 * Session Manager
 * Persists conversation history as JSONL files.
 * Manages context window by summarizing old messages when needed.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const MAX_HISTORY_MESSAGES = 50; // Keep last N messages before summarizing

export class SessionManager {
  constructor(convoDir) {
    this.convoDir = convoDir;
    mkdirSync(convoDir, { recursive: true });
    this.sessionIndex = this._loadIndex();
  }

  _loadIndex() {
    const indexPath = join(this.convoDir, 'index.json');
    if (!existsSync(indexPath)) return {};
    try { return JSON.parse(readFileSync(indexPath, 'utf-8')); }
    catch { return {}; }
  }

  _saveIndex() {
    writeFileSync(join(this.convoDir, 'index.json'), JSON.stringify(this.sessionIndex, null, 2));
  }

  async getOrCreateSession(userId, agentId) {
    const key = `${userId}:${agentId}`;
    if (this.sessionIndex[key]) return this.sessionIndex[key];

    const sessionId = uuidv4();
    this.sessionIndex[key] = sessionId;
    this._saveIndex();

    // Init session file
    const meta = { sessionId, userId, agentId, created: new Date().toISOString(), messages: [] };
    writeFileSync(this._sessionPath(sessionId), JSON.stringify(meta, null, 2));

    return sessionId;
  }

  async getHistory(sessionId) {
    const path = this._sessionPath(sessionId);
    if (!existsSync(path)) return [];
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      return data.messages || [];
    } catch { return []; }
  }

  async saveHistory(sessionId, messages) {
    const path = this._sessionPath(sessionId);
    let data = {};
    if (existsSync(path)) {
      try { data = JSON.parse(readFileSync(path, 'utf-8')); } catch {}
    }

    // Trim context window if too long
    const trimmed = messages.length > MAX_HISTORY_MESSAGES
      ? messages.slice(-MAX_HISTORY_MESSAGES)
      : messages;

    data.messages = trimmed;
    data.updatedAt = new Date().toISOString();
    writeFileSync(path, JSON.stringify(data, null, 2));
  }

  async getSession(sessionId) {
    const path = this._sessionPath(sessionId);
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf-8')); }
    catch { return null; }
  }

  async listSessions(userId) {
    return Object.entries(this.sessionIndex)
      .filter(([key]) => !userId || key.startsWith(userId + ':'))
      .map(([key, sessionId]) => {
        const [uid, agentId] = key.split(':');
        return { sessionId, userId: uid, agentId };
      });
  }

  async clearSession(sessionId) {
    // Delete the session file
    const path = this._sessionPath(sessionId);
    if (existsSync(path)) unlinkSync(path);
    // Remove from index
    for (const [key, sid] of Object.entries(this.sessionIndex)) {
      if (sid === sessionId) {
        delete this.sessionIndex[key];
      }
    }
    this._saveIndex();
    return true;
  }

  async resetSession(sessionId) {
    // Keep session in index but clear its messages
    const path = this._sessionPath(sessionId);
    if (existsSync(path)) {
      try {
        const data = JSON.parse(readFileSync(path, 'utf-8'));
        data.messages = [];
        data.updatedAt = new Date().toISOString();
        writeFileSync(path, JSON.stringify(data, null, 2));
      } catch {}
    }
    return true;
  }

  _sessionPath(sessionId) {
    return join(this.convoDir, `${sessionId}.json`);
  }
}
