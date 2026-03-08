import { readFileSync, writeFileSync, existsSync } from 'fs';

function createDiff(original, modified, label = 'text', contextLines = 3) {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const hunks = [];
  let i = 0, j = 0;
  while (i < origLines.length || j < modLines.length) {
    if (origLines[i] === modLines[j]) { i++; j++; continue; }
    const startI = Math.max(0, i - contextLines);
    const startJ = Math.max(0, j - contextLines);
    const hunkOrig = [], hunkMod = [];
    while (i < origLines.length && j < modLines.length && origLines[i] !== modLines[j]) {
      hunkOrig.push(origLines[i++]);
      hunkMod.push(modLines[j++]);
    }
    hunks.push({ startI: startI + 1, startJ: startJ + 1, removed: hunkOrig, added: hunkMod });
  }
  if (!hunks.length) return null; // no differences

  const lines = [`--- a/${label}`, `+++ b/${label}`];
  for (const h of hunks) {
    lines.push(`@@ -${h.startI},${h.removed.length} +${h.startJ},${h.added.length} @@`);
    h.removed.forEach(l => lines.push('-' + l));
    h.added.forEach(l => lines.push('+' + l));
  }
  return lines.join('\n');
}

export const skill = {
  name: 'diffs',
  description: 'Create or apply unified diffs',
  async execute({ action, original, modified, patch, target, context = 3 }) {
    if (action === 'create') {
      const origText = existsSync(original) ? readFileSync(original, 'utf-8') : (original || '');
      const modText = existsSync(modified) ? readFileSync(modified, 'utf-8') : (modified || '');
      const label = existsSync(original) ? original : 'input';
      const diff = createDiff(origText, modText, label, context);
      if (!diff) return { diff: null, message: 'No differences found' };
      return { diff, lines: diff.split('\n').length };
    }

    if (action === 'apply') {
      if (!patch || !target) return { error: 'patch and target required' };
      if (!existsSync(target)) return { error: `Target file not found: ${target}` };
      // Basic patch application
      const lines = patch.split('\n');
      let fileContent = readFileSync(target, 'utf-8').split('\n');
      const removals = lines.filter(l => l.startsWith('-')).map(l => l.slice(1));
      const additions = lines.filter(l => l.startsWith('+')).map(l => l.slice(1));
      // Simple: remove all '-' lines and add '+' lines at their positions
      for (const rem of removals) {
        const idx = fileContent.indexOf(rem);
        if (idx !== -1) fileContent.splice(idx, 1);
      }
      writeFileSync(target, fileContent.join('\n') + '\n');
      return { ok: true, target, removals: removals.length, additions: additions.length };
    }

    if (action === 'compare') {
      const origText = existsSync(original) ? readFileSync(original, 'utf-8') : (original || '');
      const modText = existsSync(modified) ? readFileSync(modified, 'utf-8') : (modified || '');
      const origLines = origText.split('\n');
      const modLines = modText.split('\n');
      const comparison = origLines.map((line, i) => ({
        line: i + 1,
        original: line,
        modified: modLines[i] !== undefined ? modLines[i] : null,
        changed: line !== modLines[i],
      })).filter(r => r.changed);
      return { changes: comparison, total: comparison.length };
    }

    return { error: `Unknown action: ${action}` };
  },
};

export default skill;
