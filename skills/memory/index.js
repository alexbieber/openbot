/**
 * Memory Skill
 * Delegates to the MemoryManager already running in the gateway.
 * Can also call the REST API if running standalone.
 */

const GATEWAY = process.env.GATEWAY_URL_HTTP || 'http://127.0.0.1:18789';

export default async function execute({ action, content, query, id, tags = [] }) {
  switch (action) {
    case 'save': {
      if (!content) throw new Error('content is required to save a memory');
      const res = await fetch(`${GATEWAY}/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, tags }),
      });
      const data = await res.json();
      return `✅ Memory saved (id: ${data.id}): "${content.substring(0, 80)}${content.length > 80 ? '...' : ''}"`;
    }

    case 'search':
    case 'list': {
      const url = query ? `${GATEWAY}/memory?query=${encodeURIComponent(query)}` : `${GATEWAY}/memory`;
      const res = await fetch(url);
      const memories = await res.json();
      if (!memories.length) return action === 'search' ? `No memories found for: "${query}"` : 'No memories stored yet.';
      const lines = memories.slice(0, 15).map((m, i) => `${i + 1}. [${m.id?.substring(0, 8)}] ${m.content.substring(0, 120)}`);
      return `Found ${memories.length} memories:\n\n${lines.join('\n')}`;
    }

    case 'delete': {
      if (!id) throw new Error('id is required to delete a memory');
      await fetch(`${GATEWAY}/memory/${id}`, { method: 'DELETE' });
      return `🗑️ Memory deleted: ${id}`;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
