function safeRegex(pattern, flags) {
  try { return { re: new RegExp(pattern, flags), error: null }; }
  catch (e) { return { re: null, error: e.message }; }
}

export default {
  name: 'regex',
  async run({ action = 'test', pattern, flags = '', input, replacement = '' }) {
    if (!pattern) return { ok: false, error: 'pattern required' };
    const { re, error } = safeRegex(pattern, flags);
    if (error) return { ok: false, error: `Invalid regex: ${error}` };

    switch (action) {
      case 'test':
        return { ok: true, matches: re.test(input || ''), pattern, flags };

      case 'match': {
        const m = (input || '').match(re);
        if (!m) return { ok: true, found: false };
        return { ok: true, found: true, match: m[0], groups: m.groups || {}, captures: m.slice(1), index: m.index };
      }

      case 'extract': {
        const all = [];
        const gRe = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
        let m;
        while ((m = gRe.exec(input || '')) !== null) {
          all.push({ match: m[0], index: m.index, captures: m.slice(1) });
        }
        return { ok: true, matches: all, count: all.length };
      }

      case 'replace': {
        const replaced = (input || '').replace(re, replacement);
        return { ok: true, result: replaced, original: input };
      }

      case 'validate':
        return { ok: true, valid: true, pattern, flags, source: re.source };

      case 'explain':
        return { ok: true, pattern, note: 'Detailed regex explanation requires a dedicated library. Pattern is syntactically valid.', flags };

      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  },
};
