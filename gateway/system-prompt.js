/**
 * OpenBot System Prompt Builder
 * Mirrors ClawdBot's full system prompt assembly with all sections:
 * Tooling · Safety · Skills · Workspace · Documentation · Date/Time · Runtime · Reasoning · Heartbeat
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { platform, release, hostname } from 'os';
import { loadSoul, buildSoulSection } from './soul-loader.js';

const BOOTSTRAP_FILES = ['AGENTS.md', 'SOUL.md', 'TOOLS.md', 'IDENTITY.md', 'USER.md', 'HEARTBEAT.md', 'BOOTSTRAP.md', 'MEMORY.md', 'memory.md'];
const MAX_FILE_CHARS = 20000;
const MAX_TOTAL_CHARS = 150000;

export class SystemPromptBuilder {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Build the full system prompt for an agent run.
   * @param {object} opts
   * @param {object} opts.agent - agent definition (id, workspace, model, etc.)
   * @param {string[]} opts.skills - list of available skill names + descriptions
   * @param {string} opts.workspacePath - path to agent workspace
   * @param {object} opts.session - current session metadata
   * @param {string} opts.model - resolved model name
   * @param {string} opts.thinkingLevel - none|auto|max
   * @param {boolean} opts.verbose - verbose tool output
   * @param {string} opts.mode - full|minimal|none
   */
  build(opts = {}) {
    const {
      agent = {},
      skills = [],
      workspacePath = process.cwd(),
      session = {},
      model = 'unknown',
      thinkingLevel = 'auto',
      verbose = false,
      mode = 'full',
    } = opts;

    if (mode === 'none') return 'You are OpenBot, a personal AI assistant.';

    const sections = [];

    // ── SOUL.md — personality override ───────────────────────────────────────
    const soul = loadSoul(workspacePath);
    const resolvedName = soul?.name || agent.name || this.config?.agents?.defaults?.name || 'OpenBot';

    // ── Identity ─────────────────────────────────────────────────────────────
    sections.push(`You are ${resolvedName}, a self-hosted personal AI agent built on OpenBot.`);
    sections.push('You run locally, execute real tasks, and remember things across conversations.\n');

    // Inject SOUL.md personality block right after identity
    const soulSection = buildSoulSection(soul);
    if (soulSection) sections.push(soulSection);

    // ── Safety ───────────────────────────────────────────────────────────────
    sections.push(`## Safety
- Never take actions that could harm the user's system, data, or privacy
- Do not seek power, resources, or capabilities beyond the current task
- Always confirm before running destructive operations (delete, overwrite, etc.)
- If a request is ambiguous, ask for clarification before acting`);

    // ── Tooling ──────────────────────────────────────────────────────────────
    sections.push(`## Available Tools
exec, read, write, edit, browser, memory_save, memory_search, memory_get, session_status, sessions_list`);

    // ── Skills ───────────────────────────────────────────────────────────────
    if (mode === 'full' && skills.length > 0) {
      const skillList = skills.map(s =>
        `  <skill><name>${s.name}</name><description>${(s.description || '').slice(0, 120)}</description></skill>`
      ).join('\n');
      sections.push(`## Skills
<available_skills>
${skillList}
</available_skills>
Use the skill name as the tool name when calling a skill. Load the SKILL.md for details before using.`);
    }

    // ── Workspace ────────────────────────────────────────────────────────────
    sections.push(`## Workspace
Working directory: ${workspacePath}
Data directory: ${this.config._dataDir || '~/.openbot'}`);

    // ── Date & Time ──────────────────────────────────────────────────────────
    const tz = this.config?.agents?.defaults?.userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    sections.push(`## Current Date & Time
Timezone: ${tz}
Use the session_status tool when you need the exact current time.`);

    // ── Runtime ──────────────────────────────────────────────────────────────
    const os = `${platform()} ${release()}`;
    const nodeVer = process.version;
    sections.push(`## Runtime
Host: ${hostname()}
OS: ${os}
Node: ${nodeVer}
Model: ${model}
Thinking: ${thinkingLevel}`);

    // ── Reasoning ────────────────────────────────────────────────────────────
    if (thinkingLevel !== 'none') {
      sections.push(`## Reasoning
Extended thinking is ${thinkingLevel === 'max' ? 'fully enabled' : 'adaptive'}.
Use /reasoning to toggle visibility. Use /thinking to change level.`);
    }

    // ── Slash Commands ────────────────────────────────────────────────────────
    sections.push(`## Slash Commands
/new or /reset — start a fresh session
/stop — abort the current run
/help — show available commands
/model <name> — switch AI model
/agent <id> — switch agent
/skills — list loaded skills
/status — show session status
/context — show context window usage
/compact — summarize and compress history
/exec host=gateway|sandbox security=allowlist — set exec policy`);

    // ── Heartbeat ────────────────────────────────────────────────────────────
    if (mode === 'full') {
      sections.push(`## Heartbeat
You receive periodic heartbeat checks. Respond with a brief status update.
If you have pending tasks, mention them. If all is well, respond with "OK".`);
    }

    // ── Workspace Bootstrap Injection ─────────────────────────────────────────
    const bootstrapContent = this._loadBootstrapFiles(workspacePath);
    if (bootstrapContent) {
      sections.push(`## Project Context\n${bootstrapContent}`);
    }

    return sections.join('\n\n');
  }

  _loadBootstrapFiles(workspacePath) {
    const parts = [];
    let totalChars = 0;

    for (const filename of BOOTSTRAP_FILES) {
      const filePath = join(workspacePath, filename);
      if (!existsSync(filePath)) continue;

      try {
        let content = readFileSync(filePath, 'utf-8');
        if (content.length > MAX_FILE_CHARS) {
          content = content.slice(0, MAX_FILE_CHARS) + `\n\n[${filename}: truncated at ${MAX_FILE_CHARS} chars]`;
        }
        if (totalChars + content.length > MAX_TOTAL_CHARS) {
          parts.push(`[${filename}: omitted — bootstrap total limit reached]`);
          break;
        }
        parts.push(`### ${filename}\n${content}`);
        totalChars += content.length;
      } catch {
        parts.push(`[${filename}: could not read]`);
      }
    }

    return parts.join('\n\n---\n\n');
  }

  /** Minimal prompt for sub-agents */
  buildMinimal(opts = {}) {
    return this.build({ ...opts, mode: 'minimal' });
  }
}
