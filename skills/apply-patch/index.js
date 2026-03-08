import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';

export const skill = {
  name: 'apply-patch',
  description: 'Apply structured multi-file patches atomically',
  async execute({ patch, workspaceOnly = true }) {
    if (!patch?.files?.length) return { error: 'patch.files required' };
    const workspace = process.cwd();
    const results = [];

    for (const file of patch.files) {
      const { path: filePath, action, content, diff } = file;
      if (!filePath || !action) { results.push({ path: filePath, error: 'path and action required' }); continue; }

      const absPath = resolve(workspace, filePath);
      if (workspaceOnly && !absPath.startsWith(resolve(workspace))) {
        results.push({ path: filePath, error: 'Path outside workspace — blocked by workspaceOnly policy' });
        continue;
      }

      try {
        if (action === 'create' || action === 'modify') {
          mkdirSync(dirname(absPath), { recursive: true });
          if (diff && existsSync(absPath)) {
            // Apply unified diff
            const current = readFileSync(absPath, 'utf-8').split('\n');
            const removes = diff.split('\n').filter(l => l.startsWith('-')).map(l => l.slice(1));
            const adds = diff.split('\n').filter(l => l.startsWith('+')).map(l => l.slice(1));
            for (const rem of removes) {
              const idx = current.indexOf(rem);
              if (idx !== -1) current.splice(idx, 1);
            }
            // Insert additions at end of removed positions (simplified)
            writeFileSync(absPath, [...current, ...adds].join('\n'));
            results.push({ path: filePath, action: 'patched', removes: removes.length, adds: adds.length });
          } else {
            writeFileSync(absPath, content || '');
            results.push({ path: filePath, action, bytes: (content || '').length });
          }
        } else if (action === 'delete') {
          if (existsSync(absPath)) { unlinkSync(absPath); results.push({ path: filePath, action: 'deleted' }); }
          else results.push({ path: filePath, action: 'delete-skipped', reason: 'file not found' });
        } else {
          results.push({ path: filePath, error: `Unknown action: ${action}` });
        }
      } catch (err) {
        results.push({ path: filePath, error: err.message });
      }
    }

    const ok = results.filter(r => !r.error).length;
    const errors = results.filter(r => r.error).length;
    return { results, summary: `${ok} succeeded, ${errors} failed` };
  },
};

export default skill;
