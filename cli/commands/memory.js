// memory.js
const GATEWAY = 'http://127.0.0.1:18789';

export async function memoryList({ query } = {}) {
  try {
    const url = query ? `${GATEWAY}/memory?query=${encodeURIComponent(query)}` : `${GATEWAY}/memory`;
    const res = await fetch(url);
    const memories = await res.json();
    if (!memories.length) { console.log('\n🧠 No memories stored yet.\n'); return; }
    console.log(`\n🧠 Memories (${memories.length}):\n`);
    memories.forEach((m, i) => {
      const date = m.created ? new Date(m.created).toLocaleDateString() : '';
      console.log(`  ${i + 1}. [${m.id?.substring(0,8)}] ${m.content.substring(0, 100)} ${date ? `(${date})` : ''}`);
    });
    console.log('');
  } catch { console.error('⚠️  Gateway not running.'); }
}

export async function memoryAdd(content) {
  try {
    const res = await fetch(`${GATEWAY}/memory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    const data = await res.json();
    console.log(`\n✅ Memory saved (${data.id})\n`);
  } catch { console.error('⚠️  Gateway not running.'); }
}

export async function memoryDelete(id) {
  try {
    await fetch(`${GATEWAY}/memory/${id}`, { method: 'DELETE' });
    console.log(`\n🗑️  Memory deleted: ${id}\n`);
  } catch { console.error('⚠️  Gateway not running.'); }
}
