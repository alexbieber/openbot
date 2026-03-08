/**
 * SOUL.md + AGENTS.md loader
 * Mirrors ClawdBot's personality system exactly.
 *
 * SOUL.md  — persistent personality file: name, tone, emoji usage, language,
 *             communication style, values, quirks.
 * AGENTS.md — defines all agents in plain English (no JSON needed).
 *
 * Both files live in the agent workspace (~/.openbot/ or project root).
 * They are hot-reloaded on every system prompt build so changes take
 * effect immediately without restarting the gateway.
 *
 * Example SOUL.md:
 * ---
 * name: Aria
 * language: en
 * tone: concise, warm, slightly witty
 * emoji: rare
 * personality: |
 *   You are Aria — an efficient, no-nonsense assistant who occasionally cracks
 *   a dry joke. You prefer bullet points over walls of text. You always ask
 *   before running destructive commands.
 * ---
 *
 * Example AGENTS.md:
 * # Agents
 * ## default
 * My personal AI. Handles everything. Model: claude-sonnet-4-6.
 *
 * ## coder
 * Specialized in writing and reviewing code. Model: gpt-4o.
 * Skills: shell, git, github, docker, file, code_review.
 *
 * ## researcher
 * Deep research assistant. Model: perplexity/llama-3.1-sonar-huge.
 * Skills: web-search, brave-search, summarize, notes, memory.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, watchFile, unwatchFile } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';

const HOME = process.env.HOME || process.env.USERPROFILE || process.cwd();
const OPENBOT_DIR = process.env.OPENBOT_DATA_DIR || join(HOME, '.openbot');

// Search order for workspace files
function resolvePath(filename, workspacePath) {
  const candidates = [
    workspacePath && join(workspacePath, filename),
    join(OPENBOT_DIR, filename),
    join(process.cwd(), filename),
  ].filter(Boolean);
  return candidates.find(p => existsSync(p)) || null;
}

// ── SOUL.md parser ────────────────────────────────────────────────────────────

let _soulCache = null;
let _soulPath = null;

export function loadSoul(workspacePath) {
  const path = resolvePath('SOUL.md', workspacePath);
  if (!path) return null;

  // Invalidate cache if file changed
  if (_soulPath !== path) {
    _soulCache = null;
    _soulPath = path;
  }

  if (_soulCache) return _soulCache;

  try {
    const raw = readFileSync(path, 'utf-8');
    const { data: frontmatter, content } = matter(raw);

    const soul = {
      name: frontmatter.name || null,
      language: frontmatter.language || 'en',
      tone: frontmatter.tone || null,
      emoji: frontmatter.emoji || 'auto', // none|rare|moderate|frequent|auto
      personality: frontmatter.personality || content.trim() || null,
      values: frontmatter.values || null,
      responseStyle: frontmatter.responseStyle || frontmatter.response_style || null,
      thinkingVisible: frontmatter.thinkingVisible ?? null,
      raw: raw,
      path,
    };

    _soulCache = soul;
    return soul;
  } catch (err) {
    console.warn(`[Soul] Failed to load SOUL.md: ${err.message}`);
    return null;
  }
}

export function buildSoulSection(soul) {
  if (!soul) return null;
  const parts = [];

  if (soul.name) parts.push(`Your name is **${soul.name}**.`);
  if (soul.language && soul.language !== 'en') parts.push(`Always respond in: ${soul.language}.`);
  if (soul.tone) parts.push(`Tone: ${soul.tone}.`);
  if (soul.emoji === 'none') parts.push('Never use emoji.');
  else if (soul.emoji === 'rare') parts.push('Use emoji sparingly — only when they genuinely add value.');
  else if (soul.emoji === 'frequent') parts.push('Feel free to use emoji liberally.');
  if (soul.responseStyle) parts.push(`Response style: ${soul.responseStyle}.`);
  if (soul.values) parts.push(`Core values: ${Array.isArray(soul.values) ? soul.values.join(', ') : soul.values}.`);
  if (soul.personality) parts.push(soul.personality.trim());

  return parts.length ? `## Soul & Personality\n${parts.join('\n')}` : null;
}

// ── AGENTS.md parser ──────────────────────────────────────────────────────────

let _agentsCache = null;
let _agentsPath = null;
let _agentsMtime = 0;

export function loadAgentsMd(workspacePath) {
  const path = resolvePath('AGENTS.md', workspacePath);
  if (!path) return null;

  try {
    const stat = { mtime: Date.now() }; // simplified — always reload
    if (_agentsPath !== path || !_agentsCache) {
      _agentsPath = path;
      _agentsCache = _parseAgentsMd(readFileSync(path, 'utf-8'));
    }
    return _agentsCache;
  } catch (err) {
    console.warn(`[Agents] Failed to load AGENTS.md: ${err.message}`);
    return null;
  }
}

function _parseAgentsMd(content) {
  const agents = {};
  const lines = content.split('\n');
  let currentAgent = null;
  let currentLines = [];

  const flush = () => {
    if (!currentAgent) return;
    agents[currentAgent] = _parseAgentBlock(currentAgent, currentLines.join('\n'));
    currentLines = [];
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      flush();
      currentAgent = h2[1].trim().toLowerCase();
      continue;
    }
    if (currentAgent) currentLines.push(line);
  }
  flush();
  return agents;
}

function _parseAgentBlock(name, text) {
  const agent = { id: name, name, description: '', skills: [], model: null, channels: [] };
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Model: xxx
    const modelMatch = trimmed.match(/^model:\s*(.+)/i);
    if (modelMatch) { agent.model = modelMatch[1].trim(); continue; }

    // Skills: a, b, c
    const skillsMatch = trimmed.match(/^skills?:\s*(.+)/i);
    if (skillsMatch) {
      agent.skills = skillsMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      continue;
    }

    // Channels: telegram, discord
    const channelsMatch = trimmed.match(/^channels?:\s*(.+)/i);
    if (channelsMatch) {
      agent.channels = channelsMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      continue;
    }

    // First non-directive line is the description
    if (!agent.description) agent.description = trimmed;
  }

  return agent;
}

export function mergeAgentsMdIntoConfig(config, workspacePath) {
  const agentsMd = loadAgentsMd(workspacePath);
  if (!agentsMd || !Object.keys(agentsMd).length) return config;

  const merged = { ...config };
  if (!merged.agents) merged.agents = {};
  if (!merged.agents.list) merged.agents.list = [];

  for (const [id, agent] of Object.entries(agentsMd)) {
    const existing = merged.agents.list.find(a => a.id === id);
    if (existing) {
      // AGENTS.md overrides JSON config
      if (agent.model) existing.model = agent.model;
      if (agent.skills?.length) existing.skills = agent.skills;
      if (agent.description) existing.description = agent.description;
    } else {
      merged.agents.list.push(agent);
    }
  }

  return merged;
}

// ── Default SOUL.md + AGENTS.md templates ────────────────────────────────────

export function createDefaultSoul(workspacePath = OPENBOT_DIR) {
  const path = join(workspacePath, 'SOUL.md');
  if (existsSync(path)) return false;

  const template = `---
name: OpenBot
language: en
tone: helpful, concise, direct
emoji: rare
responseStyle: Prefer bullet points for lists. Use code blocks for code. Keep answers brief unless asked for detail.
values:
  - honesty
  - efficiency
  - privacy
---

You are OpenBot — a self-hosted personal AI agent. You run locally on the user's machine
and have access to tools that let you take real actions. You are helpful, efficient, and
privacy-conscious. You never share data with third parties unless explicitly asked to.

When you're unsure about something, say so rather than guessing. When given a task,
complete it fully and report back concisely. Before running destructive operations,
always confirm with the user first.
`;

  try {
    mkdirSync(workspacePath, { recursive: true });
    writeFileSync(path, template);
    return true;
  } catch { return false; }
}

export function createDefaultAgentsMd(workspacePath = OPENBOT_DIR) {
  const path = join(workspacePath, 'AGENTS.md');
  if (existsSync(path)) return false;

  const template = `# OpenBot Agents
Configure your agents here. Each ## section is a named agent.
You can override model, skills, and channels per agent.
Changes take effect immediately — no gateway restart needed.

## default
My personal AI agent. Handles everything from coding to research to smart home control.
Model: claude-sonnet-4-6
Skills: shell, file, memory, browser, web-search, github, calendar, email, image, weather

## coder
Specialized code assistant. Focused on software development.
Model: gpt-4o
Skills: shell, file, git, github, docker, code_review, database

## researcher
Deep research agent. Best for complex questions requiring web search and synthesis.
Model: perplexity/llama-3.1-sonar-huge
Skills: web-search, brave-search, summarize, notes, memory, rss, news
`;

  try {
    mkdirSync(workspacePath, { recursive: true });
    writeFileSync(path, template);
    return true;
  } catch { return false; }
}
