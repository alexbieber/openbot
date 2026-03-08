function getPath(obj, path) {
  return path.replace(/^\./,'').split(/[\.\[\]]+/).filter(Boolean).reduce((acc, key) => acc?.[key], obj);
}

function flatten(obj, prefix = '', result = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, result);
    else result[key] = v;
  }
  return result;
}

function diffObjects(a, b, path = '') {
  const diffs = [];
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const fullPath = path ? `${path}.${k}` : k;
    if (!(k in (a || {}))) diffs.push({ op: 'add', path: fullPath, value: b[k] });
    else if (!(k in (b || {}))) diffs.push({ op: 'remove', path: fullPath });
    else if (typeof a[k] === 'object' && typeof b[k] === 'object' && a[k] && b[k]) diffs.push(...diffObjects(a[k], b[k], fullPath));
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diffs.push({ op: 'replace', path: fullPath, from: a[k], to: b[k] });
  }
  return diffs;
}

export default {
  name: 'json',
  async run({ action = 'format', input, query, compare }) {
    if (!input) return { ok: false, error: 'input is required' };
    let parsed;
    try { parsed = typeof input === 'string' ? JSON.parse(input) : input; }
    catch (e) { return { ok: false, error: `Invalid JSON: ${e.message}` }; }

    switch (action) {
      case 'parse': return { ok: true, data: parsed, type: typeof parsed, isArray: Array.isArray(parsed) };
      case 'format': return { ok: true, output: JSON.stringify(parsed, null, 2) };
      case 'minify': return { ok: true, output: JSON.stringify(parsed) };
      case 'validate': return { ok: true, valid: true, type: Array.isArray(parsed) ? 'array' : typeof parsed };
      case 'keys': return { ok: true, keys: Object.keys(parsed || {}) };
      case 'values': return { ok: true, values: Object.values(parsed || {}) };
      case 'flatten': return { ok: true, data: flatten(parsed) };
      case 'query': {
        if (!query) return { ok: false, error: 'query required' };
        const result = getPath(parsed, query);
        return { ok: true, query, result, type: typeof result };
      }
      case 'diff': {
        if (!compare) return { ok: false, error: 'compare required for diff' };
        let b;
        try { b = JSON.parse(compare); } catch (e) { return { ok: false, error: `compare parse error: ${e.message}` }; }
        return { ok: true, diffs: diffObjects(parsed, b) };
      }
      default: return { ok: false, error: `Unknown action: ${action}` };
    }
  },
};
