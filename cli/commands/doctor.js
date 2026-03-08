// doctor.js
import { existsSync } from 'fs';
import { join } from 'path';

const CONFIG_PATH = join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.openbot', 'config.json');
const GATEWAY = 'http://127.0.0.1:18789';

export async function doctor() {
  console.log('\nOpenBot Doctor\n');

  const checks = [
    {
      name: 'Node.js version ≥ 22',
      check: () => {
        const [major] = process.version.replace('v', '').split('.').map(Number);
        return { ok: major >= 22, detail: `Found: ${process.version}` };
      },
    },
    {
      name: 'Config file exists',
      check: () => ({ ok: existsSync(CONFIG_PATH), detail: CONFIG_PATH }),
    },
    {
      name: 'API key configured',
      check: () => {
        if (!existsSync(CONFIG_PATH)) return { ok: false, detail: 'Config not found' };
        const c = JSON.parse(require('fs').readFileSync(CONFIG_PATH, 'utf-8'));
        const hasKey = c.ai?.anthropicApiKey || c.ai?.openaiApiKey || c.ai?.deepseekApiKey || c.ai?.ollamaUrl;
        return { ok: !!hasKey, detail: hasKey ? 'Found' : 'Missing — run: openbot onboard' };
      },
    },
    {
      name: 'Gateway running',
      check: async () => {
        try {
          const res = await fetch(`${GATEWAY}/health`, { signal: AbortSignal.timeout(2000) });
          const h = await res.json();
          return { ok: true, detail: `v${h.version}, model: ${h.model}` };
        } catch {
          return { ok: false, detail: 'Not running — start with: npm start' };
        }
      },
    },
    {
      name: 'Default agent SOUL.md',
      check: () => {
        const path = join(process.cwd(), 'agents', 'default', 'SOUL.md');
        return { ok: existsSync(path), detail: path };
      },
    },
  ];

  for (const { name, check } of checks) {
    const { ok, detail } = await check();
    const icon = ok ? '✅' : '❌';
    console.log(`  ${icon} ${name.padEnd(30)} ${detail}`);
  }

  console.log('\n');
}
