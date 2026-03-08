/**
 * Notes Skill
 * Local markdown note manager stored in ~/.openbot/notes/
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const NOTES_DIR = join(HOME, '.openbot', 'notes');
mkdirSync(NOTES_DIR, { recursive: true });

function slug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function notePath(title) {
  return join(NOTES_DIR, `${slug(title)}.md`);
}

function loadNote(file) {
  try {
    const raw = readFileSync(join(NOTES_DIR, file), 'utf-8');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { title: file.replace('.md', ''), content: raw, tags: '', created: '' };
    const meta = {};
    match[1].split('\n').forEach(l => { const [k, ...v] = l.split(': '); if (k) meta[k.trim()] = v.join(': ').trim(); });
    return { title: meta.title || file.replace('.md', ''), content: match[2].trim(), tags: meta.tags || '', created: meta.created || '' };
  } catch { return null; }
}

export default async function execute({ action, title, content, query, tags }) {
  switch (action) {
    case 'add': {
      if (!title || !content) throw new Error('title and content required');
      const meta = `---\ntitle: ${title}\ncreated: ${new Date().toISOString()}\ntags: ${tags || ''}\n---\n\n`;
      writeFileSync(notePath(title), meta + content);
      return `✅ Note saved: "${title}"`;
    }
    case 'list': {
      if (!existsSync(NOTES_DIR)) return 'No notes yet.';
      const files = readdirSync(NOTES_DIR).filter(f => f.endsWith('.md'));
      if (!files.length) return 'No notes yet.';
      const notes = files.map(f => loadNote(f)).filter(Boolean);
      return `Your notes (${notes.length}):\n\n` + notes.map((n, i) =>
        `${i + 1}. **${n.title}**${n.tags ? ` [${n.tags}]` : ''}\n   ${n.content.substring(0, 80)}...`
      ).join('\n\n');
    }
    case 'read': {
      if (!title) throw new Error('title required');
      const p = notePath(title);
      if (!existsSync(p)) throw new Error(`Note not found: "${title}"`);
      const n = loadNote(`${slug(title)}.md`);
      return `**${n.title}**${n.tags ? ` [${n.tags}]` : ''}\n${n.created ? `Created: ${n.created}\n` : ''}\n${n.content}`;
    }
    case 'search': {
      if (!query) throw new Error('query required');
      const files = readdirSync(NOTES_DIR).filter(f => f.endsWith('.md'));
      const q = query.toLowerCase();
      const matches = files.map(f => loadNote(f)).filter(n => n && (
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.toLowerCase().includes(q)
      ));
      if (!matches.length) return `No notes matching "${query}"`;
      return `Found ${matches.length} note(s):\n\n` + matches.map((n, i) =>
        `${i + 1}. **${n.title}**\n   ${n.content.substring(0, 120)}...`
      ).join('\n\n');
    }
    case 'delete': {
      if (!title) throw new Error('title required');
      const p = notePath(title);
      if (!existsSync(p)) throw new Error(`Note not found: "${title}"`);
      unlinkSync(p);
      return `🗑️ Deleted note: "${title}"`;
    }
    case 'edit': {
      if (!title) throw new Error('title required');
      const p = notePath(title);
      if (!existsSync(p)) throw new Error(`Note not found: "${title}"`);
      const existing = loadNote(`${slug(title)}.md`);
      const meta = `---\ntitle: ${title}\ncreated: ${existing.created}\nupdated: ${new Date().toISOString()}\ntags: ${tags || existing.tags}\n---\n\n`;
      writeFileSync(p, meta + (content || existing.content));
      return `✅ Note updated: "${title}"`;
    }
    default: throw new Error(`Unknown action: ${action}`);
  }
}
