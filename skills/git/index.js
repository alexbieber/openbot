import { execSync } from 'child_process';

const SAFE_ACTIONS = new Set(['status', 'diff', 'log', 'show', 'branch', 'stash']);
const DESTRUCTIVE = new Set(['push', 'reset', 'checkout', 'commit']);

export default {
  name: 'git',
  async run({ action, repo, args = '', cwd = process.cwd() }, { config, audit }) {
    const isDestructive = DESTRUCTIVE.has(action);
    if (isDestructive && config?.security?.requireConfirm) {
      return { ok: false, error: 'Destructive git action requires confirmation. Pass confirmed:true.' };
    }

    let cmd;
    if (action === 'clone') {
      if (!repo) return { ok: false, error: 'repo URL required for clone' };
      cmd = `git clone ${repo} ${args}`.trim();
    } else {
      cmd = `git ${action} ${args}`.trim();
    }

    await audit?.log?.({ action: 'skill:git', cmd });

    try {
      const out = execSync(cmd, { cwd, encoding: 'utf-8', timeout: 30000 });
      return { ok: true, output: out.trim() || '(no output)', cmd };
    } catch (err) {
      return { ok: false, error: err.stderr?.toString()?.trim() || err.message, cmd };
    }
  },
};
