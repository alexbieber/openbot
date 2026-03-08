/**
 * Agent Loader
 * Reads SOUL.md files from agent workspace folders.
 * Each SOUL.md defines identity, skills, rules, and behavior.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';

export class AgentLoader {
  constructor(agentsDir) {
    this.agentsDir = agentsDir;
    this.agents = new Map();
  }

  loadAll() {
    if (!existsSync(this.agentsDir)) return;
    const dirs = readdirSync(this.agentsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dir of dirs) {
      try {
        this._loadAgent(dir);
      } catch (err) {
        console.warn(`[Agents] Failed to load agent '${dir}':`, err.message);
      }
    }

    console.log(`[Agents] Loaded: ${[...this.agents.keys()].join(', ')}`);
  }

  _loadAgent(name) {
    const agentDir = join(this.agentsDir, name);
    const soulPath = join(agentDir, 'SOUL.md');
    if (!existsSync(soulPath)) return;

    const raw = readFileSync(soulPath, 'utf-8');
    const { data: frontmatter, content } = matter(raw);

    // Parse skills from content
    const skills = this._parseSkills(content);
    const rules = this._parseRules(content);
    const heartbeat = this._parseHeartbeat(agentDir);

    this.agents.set(name, {
      id: name,
      name: frontmatter.name || name,
      model: frontmatter.model || null, // null = use global default
      systemPrompt: this._buildSystemPrompt(content),
      skills,
      rules,
      heartbeat,
      raw: content,
    });
  }

  _buildSystemPrompt(content) {
    // Strip markdown headings and return clean system prompt
    const identityMatch = content.match(/## Identity\n([\s\S]*?)(?=\n##|$)/);
    if (identityMatch) return identityMatch[1].trim();

    // Fallback: use full SOUL.md content as system prompt
    return content.trim();
  }

  _parseSkills(content) {
    const skillsMatch = content.match(/## Skills\n([\s\S]*?)(?=\n##|$)/);
    if (!skillsMatch) return [];
    return skillsMatch[1]
      .split('\n')
      .map(l => l.replace(/^-\s*/, '').split(':')[0].trim())
      .filter(Boolean);
  }

  _parseRules(content) {
    const rulesMatch = content.match(/## Rules\n([\s\S]*?)(?=\n##|$)/);
    if (!rulesMatch) return [];
    return rulesMatch[1].split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean);
  }

  _parseHeartbeat(agentDir) {
    const hbPath = join(agentDir, 'HEARTBEAT.md');
    if (!existsSync(hbPath)) return [];

    const raw = readFileSync(hbPath, 'utf-8');
    const tasks = [];
    const taskPattern = /## (.+)\n- Schedule: (.+)\n- Message: (.+)/g;
    let match;
    while ((match = taskPattern.exec(raw)) !== null) {
      tasks.push({ name: match[1], schedule: match[2], message: match[3] });
    }
    return tasks;
  }

  getAgent(id) { return this.agents.get(id) || null; }
  agentCount() { return this.agents.size; }
  listAgents() { return [...this.agents.values()].map(a => ({ id: a.id, name: a.name, skills: a.skills })); }
}
