/**
 * Memory Manager
 * Stores long-term memories as Markdown files.
 * Supports keyword search and optional Voyage AI semantic search.
 */

import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

export class MemoryManager {
  constructor(memoryDir) {
    this.memoryDir = memoryDir;
    mkdirSync(memoryDir, { recursive: true });
  }

  async save(content, tags = []) {
    const id = uuidv4();
    const ts = new Date().toISOString();
    const tagStr = tags.length ? tags.join(', ') : '';
    const md = `---\nid: ${id}\ncreated: ${ts}\ntags: ${tagStr}\n---\n\n${content}\n`;
    writeFileSync(join(this.memoryDir, `${id}.md`), md, 'utf-8');
    return id;
  }

  async list(query) {
    return this._loadAll(query);
  }

  async search(query, limit = 5) {
    const all = this._loadAll();
    if (!query) return all.slice(0, limit);

    // Use Voyage AI semantic search if configured
    const voyageKey = process.env.VOYAGE_API_KEY;
    if (voyageKey && all.length > 0) {
      try {
        return await this._semanticSearch(query, all, limit, voyageKey);
      } catch {
        // Fall through to keyword search
      }
    }

    // Keyword search fallback
    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    return all
      .map(m => ({ ...m, score: keywords.filter(k => m.content.toLowerCase().includes(k)).length }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async _semanticSearch(query, memories, limit, apiKey) {
    const docs = memories.map(m => m.content.substring(0, 500));
    const res = await axios.post(
      'https://api.voyageai.com/v1/embeddings',
      { input: [query, ...docs], model: 'voyage-2' },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 8000,
      }
    );

    const embeddings = res.data.data.map(d => d.embedding);
    const queryEmbed = embeddings[0];
    const docEmbeds = embeddings.slice(1);

    function cosine(a, b) {
      const dot = a.reduce((s, v, i) => s + v * b[i], 0);
      const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
      const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
      return dot / (normA * normB);
    }

    return memories
      .map((m, i) => ({ ...m, score: cosine(queryEmbed, docEmbeds[i]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async delete(id) {
    const path = join(this.memoryDir, `${id}.md`);
    if (existsSync(path)) unlinkSync(path);
  }

  _loadAll(filterQuery) {
    if (!existsSync(this.memoryDir)) return [];
    const files = readdirSync(this.memoryDir).filter(f => f.endsWith('.md'));
    const memories = files.map(f => {
      try {
        const raw = readFileSync(join(this.memoryDir, f), 'utf-8');
        const match = raw.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);
        if (!match) return null;
        const meta = {};
        match[1].split('\n').forEach(line => {
          const [k, ...v] = line.split(': ');
          if (k) meta[k.trim()] = v.join(': ').trim();
        });
        return { id: meta.id, created: meta.created, tags: meta.tags, content: match[2].trim() };
      } catch { return null; }
    }).filter(Boolean);

    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      return memories.filter(m => m.content.toLowerCase().includes(q));
    }

    return memories.sort((a, b) => new Date(b.created) - new Date(a.created));
  }

  // Auto-extract important facts from conversations
  async autoExtract(userMsg, assistantMsg) {
    const triggers = [
      /my name is (.+)/i,
      /i prefer (.+)/i,
      /i work (?:at|for|in) (.+)/i,
      /remember that (.+)/i,
      /don't forget (.+)/i,
      /i live in (.+)/i,
      /my (.+) is (.+)/i,
    ];

    for (const pattern of triggers) {
      const match = userMsg.match(pattern);
      if (match) {
        await this.save(`User stated: "${userMsg.trim()}"`, ['auto-extracted', 'user-info']);
        break;
      }
    }
  }
}
