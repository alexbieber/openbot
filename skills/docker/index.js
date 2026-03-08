import { execSync } from 'child_process';

const DESTRUCTIVE = new Set(['rm', 'rmi', 'stop', 'kill']);

export default {
  name: 'docker',
  async run({ action, target = '', args = '' }, { config, audit }) {
    if (DESTRUCTIVE.has(action) && config?.security?.requireConfirm) {
      return { ok: false, error: 'Destructive docker action requires confirmation.' };
    }

    let cmd;
    if (action === 'compose') {
      cmd = `docker compose ${args}`.trim();
    } else if (action === 'exec') {
      cmd = `docker exec ${target} ${args}`.trim();
    } else {
      cmd = `docker ${action} ${target} ${args}`.trim();
    }

    await audit?.log?.({ action: 'skill:docker', cmd });

    try {
      const out = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
      return { ok: true, output: out.trim() || '(no output)', cmd };
    } catch (err) {
      return { ok: false, error: err.stderr?.toString()?.trim() || err.message, cmd };
    }
  },
};
