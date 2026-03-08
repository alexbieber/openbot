/**
 * Obsidian Sync — mirrors OpenBot memory files to an Obsidian vault.
 * Also supports Raycast deep-links for quick AI access.
 *
 * Features:
 * - Watch ~/.openbot/memory/ and sync to Obsidian vault
 * - Create daily notes with conversation summaries
 * - Trigger Raycast deeplink on macOS for quick AI access
 * - Tag and link memories in Obsidian format
 *
 * Config:
 *   integrations.obsidian.vault: "/Users/me/Documents/ObsidianVault"
 *   integrations.obsidian.folder: "OpenBot"       # subfolder in vault
 *   integrations.obsidian.dailyNotes: true
 *   integrations.raycast.enabled: true
 */

import { existsSync, mkdirSync, writeFileSync, watch, readFileSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';

export class ObsidianSync {
  constructor(config = {}, dataDir) {
    this.config = config?.integrations?.obsidian || {};
    this.raycastConfig = config?.integrations?.raycast || {};
    this.dataDir = dataDir;
    this.memoryDir = join(dataDir, 'memory');
    this._watcher = null;
  }

  get vaultPath() {
    return this.config.vault || process.env.OBSIDIAN_VAULT_PATH;
  }

  get folder() {
    return this.config.folder || 'OpenBot';
  }

  isEnabled() {
    return !!(this.vaultPath && existsSync(this.vaultPath));
  }

  _obsidianPath(filename) {
    const dir = join(this.vaultPath, this.folder);
    mkdirSync(dir, { recursive: true });
    return join(dir, filename);
  }

  _addObsidianFrontmatter(content, filename) {
    if (content.startsWith('---')) return content;
    const tag = basename(filename, '.md').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    return `---\ntags: [openbot, memory]\ncreated: ${new Date().toISOString().slice(0,10)}\nsource: openbot\n---\n\n${content}`;
  }

  syncFile(filename, content) {
    if (!this.isEnabled()) return false;
    const dest = this._obsidianPath(filename);
    const enriched = this._addObsidianFrontmatter(content, filename);
    writeFileSync(dest, enriched, 'utf-8');
    return true;
  }

  syncAllMemories() {
    if (!this.isEnabled() || !existsSync(this.memoryDir)) return 0;
    const { readdirSync } = require('fs');
    const files = readdirSync(this.memoryDir).filter(f => f.endsWith('.md'));
    let synced = 0;
    for (const f of files) {
      const content = readFileSync(join(this.memoryDir, f), 'utf-8');
      if (this.syncFile(f, content)) synced++;
    }
    return synced;
  }

  createDailyNote(summary, date = new Date()) {
    if (!this.isEnabled() || !this.config.dailyNotes) return false;
    const dateStr = date.toISOString().slice(0, 10);
    const filename = `${dateStr}.md`;
    const dir = join(this.vaultPath, this.folder, 'Daily Notes');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, filename);
    const existing = existsSync(path) ? readFileSync(path, 'utf-8') : `---\ntags: [openbot, daily]\ndate: ${dateStr}\n---\n\n# OpenBot — ${dateStr}\n\n`;
    const newContent = existing + `\n## ${date.toLocaleTimeString()}\n\n${summary}\n`;
    writeFileSync(path, newContent, 'utf-8');
    return true;
  }

  openInObsidian(filename) {
    if (process.platform !== 'darwin' && process.platform !== 'linux') return false;
    const vaultName = basename(this.vaultPath);
    const path = `${this.folder}/${filename}`.replace('.md', '');
    const url = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path)}`;
    try {
      if (process.platform === 'darwin') execSync(`open "${url}"`);
      else execSync(`xdg-open "${url}"`);
      return true;
    } catch { return false; }
  }

  // Trigger Raycast quick AI on macOS
  triggerRaycast(query) {
    if (process.platform !== 'darwin') return false;
    if (!this.raycastConfig.enabled) return false;
    try {
      const url = `raycast://extensions/raycast/raycast-ai/ai-chat?fallbackText=${encodeURIComponent(query)}`;
      execSync(`open "${url}"`);
      return true;
    } catch { return false; }
  }

  // Watch memory dir and auto-sync to Obsidian
  startWatcher() {
    if (!this.isEnabled() || !existsSync(this.memoryDir)) return;
    this._watcher = watch(this.memoryDir, (eventType, filename) => {
      if (!filename?.endsWith('.md')) return;
      try {
        const content = readFileSync(join(this.memoryDir, filename), 'utf-8');
        this.syncFile(filename, content);
      } catch {}
    });
    console.log(`[ObsidianSync] Watching ${this.memoryDir} → ${this.vaultPath}/${this.folder}`);
  }

  stop() {
    this._watcher?.close?.();
  }

  status() {
    return {
      enabled: this.isEnabled(),
      vault: this.vaultPath || null,
      folder: this.folder,
      raycast: this.raycastConfig.enabled || false,
    };
  }
}
