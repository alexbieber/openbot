/**
 * Skill Engine
 * Loads SKILL.md definitions and executes skill handlers.
 * Skills are the plugin system — each subfolder is a capability.
 */

import { readdirSync, readFileSync, existsSync, watch } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import matter from 'gray-matter';
import axios from 'axios';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class SkillEngine {
  constructor(skillsDir, config, audit) {
    this.skillsDir = skillsDir;
    this.config = config;
    this.audit = audit;
    this.skills = new Map(); // name → { meta, handler }
    this._watcher = null;
    this._reloadDebounce = new Map(); // skillName → timer
  }

  loadAll() {
    if (!existsSync(this.skillsDir)) return;
    const dirs = readdirSync(this.skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dir of dirs) {
      try {
        this._loadSkill(dir);
      } catch (err) {
        console.warn(`[Skills] Failed to load skill '${dir}':`, err.message);
      }
    }
    console.log(`[Skills] Loaded: ${[...this.skills.keys()].join(', ')}`);
  }

  /**
   * Start hot-reload watcher on the skills directory.
   * Adding a new folder, editing SKILL.md, or updating index.js
   * automatically reloads the skill — no gateway restart needed.
   */
  startHotReload() {
    if (this._watcher || !existsSync(this.skillsDir)) return;

    try {
      this._watcher = watch(this.skillsDir, { recursive: true }, (event, filename) => {
        if (!filename) return;
        const parts = filename.split(/[\\/]/);
        const skillName = parts[0];
        if (!skillName) return;

        // Debounce: wait 300ms after last change before reloading
        if (this._reloadDebounce.has(skillName)) {
          clearTimeout(this._reloadDebounce.get(skillName));
        }
        this._reloadDebounce.set(skillName, setTimeout(() => {
          this._reloadDebounce.delete(skillName);
          this._hotReloadSkill(skillName);
        }, 300));
      });

      console.log(`[Skills] Hot-reload enabled — watching ${this.skillsDir}`);
    } catch (err) {
      console.warn(`[Skills] Hot-reload unavailable: ${err.message}`);
    }
  }

  _hotReloadSkill(name) {
    const skillDir = join(this.skillsDir, name);
    if (!existsSync(skillDir)) {
      // Skill directory removed
      if (this.skills.has(name)) {
        this.skills.delete(name);
        console.log(`[Skills:Hot] Removed: ${name}`);
      }
      return;
    }

    try {
      const wasLoaded = this.skills.has(name);
      // Clear cached handler so it's re-imported fresh
      if (this.skills.has(name)) {
        const skill = this.skills.get(name);
        skill.handler = null;
      }
      this._loadSkill(name);
      // Force re-import by clearing Node's module cache (ESM workaround via timestamp)
      const skill = this.skills.get(name);
      if (skill) {
        skill.handler = null;
        skill._reloadedAt = Date.now();
      }
      console.log(`[Skills:Hot] ${wasLoaded ? 'Reloaded' : 'Added'}: ${name}`);
    } catch (err) {
      console.warn(`[Skills:Hot] Failed to reload '${name}': ${err.message}`);
    }
  }

  stopHotReload() {
    this._watcher?.close();
    this._watcher = null;
    for (const t of this._reloadDebounce.values()) clearTimeout(t);
    this._reloadDebounce.clear();
  }

  /** Manually reload a specific skill by name */
  reloadSkill(name) {
    this._hotReloadSkill(name);
    return this.skills.has(name);
  }

  _loadSkill(name) {
    const skillDir = join(this.skillsDir, name);
    const skillMdPath = join(skillDir, 'SKILL.md');
    const handlerPath = join(skillDir, 'index.js');

    if (!existsSync(skillMdPath)) {
      console.warn(`[Skills] No SKILL.md in ${name}`);
      return;
    }

    const raw = readFileSync(skillMdPath, 'utf-8');
    const { data: meta, content: docs } = matter(raw);

    if (!existsSync(handlerPath)) {
      console.warn(`[Skills] No index.js in ${name}`);
      return;
    }

    this.skills.set(name, {
      name,
      description: meta.description || docs.split('\n').find(l => l.trim()) || name,
      inputSchema: meta.inputSchema || {
        type: 'object',
        properties: { input: { type: 'string', description: 'The input for this skill' } },
        required: [],
      },
      meta,
      docs,
      handlerPath,
      handler: null, // lazy load
    });
  }

  async execute(skillName, input, context = {}) {
    const skill = this.skills.get(skillName);
    if (!skill) throw new Error(`Skill '${skillName}' not found`);

    // Security: check permission policy
    this._checkPermissions(skillName, input, context);

    // Lazy load handler + optional VirusTotal scan on first load
    if (!skill.handler) {
      await this._scanSkillIfEnabled(skill);
      // Use file:// URL for Windows compatibility (raw paths break on Windows ESM)
      const importUrl = pathToFileURL(skill.handlerPath).href
        + (skill._reloadedAt ? `?t=${skill._reloadedAt}` : '');
      const mod = await import(importUrl);
      const exp = mod.default || mod.execute || mod.run;
      // Handle two export patterns:
      //   1) export default async function(input, ctx) {}  → call directly
      //   2) export default { run(input, ctx) {} }        → call .run
      if (typeof exp === 'function') {
        skill.handler = exp;
      } else if (exp && typeof exp.run === 'function') {
        skill.handler = (input, ctx) => exp.run(input, ctx);
      } else if (exp && typeof exp.handler === 'function') {
        skill.handler = (input, ctx) => exp.handler(input, ctx);
      } else {
        throw new Error(`Skill '${skillName}' does not export a callable function (export default function or { run })`);
      }
    }

    console.log(`[Skills] Executing: ${skillName}`, JSON.stringify(input).substring(0, 80));

    const startTime = Date.now();
    const result = await skill.handler(input, { config: this.config, ...context });
    const duration = Date.now() - startTime;

    this.audit?.log({ type: 'skill_execute', skillName, input, duration });

    return result;
  }

  _checkPermissions(skillName, input, context) {
    const policy = this.config.security?.permissions || {};

    // Shell skill: check allow/deny lists
    if (skillName === 'shell') {
      const cmd = input.command || '';
      const denied = policy.shellDenyList || ['rm -rf /', 'sudo rm', 'format', '> /dev/'];
      for (const pattern of denied) {
        if (cmd.includes(pattern)) {
          throw new Error(`Security: command blocked by denylist: "${pattern}"`);
        }
      }
    }
  }

  async _scanSkillIfEnabled(skill) {
    const vtKey = process.env.VIRUSTOTAL_API_KEY || this.config.security?.virusTotalApiKey;
    if (!vtKey) return;

    // Only scan 3rd-party (hub) skills — built-in skills are trusted
    const isBuiltin = skill.handlerPath.includes('skills' + require?.resolve ? '' : '/') &&
      !skill.handlerPath.includes('hub-skills');
    if (isBuiltin && this.config.security?.skipBuiltinVTScan !== false) return;

    // Compute SHA-256 hash of the skill file
    let fileHash;
    try {
      const { createHash } = await import('crypto');
      const code = readFileSync(skill.handlerPath, 'utf-8');
      fileHash = createHash('sha256').update(code).digest('hex');
    } catch { return; }

    // Check scan cache (avoid re-scanning same file)
    if (!this._vtCache) this._vtCache = new Map();
    if (this._vtCache.has(fileHash)) {
      const cached = this._vtCache.get(fileHash);
      if (cached.malicious > 0 || cached.suspicious > 2) {
        throw new Error(`VirusTotal previously flagged this skill: ${cached.malicious} malicious, ${cached.suspicious} suspicious detections`);
      }
      return; // clean scan, use cache
    }

    const headers = { 'x-apikey': vtKey };
    const vtBase = 'https://www.virustotal.com/api/v3';

    try {
      // Step 1: Check if hash is already known to VT (free — no upload needed)
      const hashCheck = await axios.get(`${vtBase}/files/${fileHash}`, { headers, timeout: 8000 }).catch(() => null);

      let stats;
      if (hashCheck?.data?.data?.attributes?.last_analysis_stats) {
        // Hash known — use cached result
        stats = hashCheck.data.data.attributes.last_analysis_stats;
        console.log(`[Skills] VirusTotal: '${skill.name}' — hash known, using cached result`);
      } else {
        // Step 2: Upload for fresh scan
        console.log(`[Skills] VirusTotal: uploading '${skill.name}' for scan...`);
        const code = readFileSync(skill.handlerPath, 'utf-8');
        const formData = new FormData();
        formData.append('file', new Blob([code], { type: 'text/javascript' }), `${skill.name}.js`);

        const uploadRes = await axios.post(`${vtBase}/files`, formData, { headers, timeout: 20000 });
        const analysisId = uploadRes.data.data.id;

        // Poll for results (up to 30s)
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const analysis = await axios.get(`${vtBase}/analyses/${analysisId}`, { headers, timeout: 10000 });
          if (analysis.data.data.attributes.status === 'completed') {
            stats = analysis.data.data.attributes.stats;
            break;
          }
        }
      }

      if (!stats) {
        console.warn(`[Skills] VirusTotal scan timed out for '${skill.name}' — proceeding`);
        return;
      }

      const malicious = stats.malicious || 0;
      const suspicious = stats.suspicious || 0;

      this._vtCache.set(fileHash, { malicious, suspicious, scannedAt: new Date().toISOString() });
      this.audit?.log({ type: 'skill_vt_scan', skill: skill.name, malicious, suspicious, hash: fileHash });

      if (malicious > 2) {
        throw new Error(`VirusTotal: skill '${skill.name}' flagged as MALICIOUS (${malicious} detections). Blocked.`);
      } else if (malicious > 0 || suspicious > 3) {
        console.warn(`[Skills] ⚠️  VirusTotal warning for '${skill.name}': ${malicious} malicious, ${suspicious} suspicious. Loading anyway — review manually.`);
      } else {
        console.log(`[Skills] ✅ VirusTotal clean: '${skill.name}' (${stats.harmless || 0} harmless, ${malicious} malicious)`);
      }
    } catch (err) {
      if (err.message.includes('Blocked')) throw err;
      console.warn(`[Skills] VirusTotal scan skipped for '${skill.name}': ${err.message}`);
    }
  }

  // Hot-reload: re-read SKILL.md and clear cached handler
  reload(skillName) {
    const skill = this.skills.get(skillName);
    if (!skill) return false;
    skill.handler = null; // clear cache, will lazy-load on next execute
    this._loadSkill(skillName); // re-read metadata
    console.log(`[Skills] Hot-reloaded: ${skillName}`);
    return true;
  }

  reloadAll() {
    for (const name of this.skills.keys()) this.reload(name);
    console.log(`[Skills] Hot-reload complete: ${this.skills.size} skills`);
  }

  getSkill(name) { return this.skills.get(name) || null; }
  listSkills() { return [...this.skills.values()].map(s => ({ name: s.name, description: s.description })); }
  skillCount() { return this.skills.size; }
}
