// doctor.js
import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const CONFIG_PATH = join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.openbot', 'config.json');
const GATEWAY = 'http://127.0.0.1:18789';

function hasApiKeyFromEnv() {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OLLAMA_URL ||
    process.env.GEMINI_API_KEY ||
    process.env.TOGETHER_API_KEY ||
    process.env.MISTRAL_API_KEY
  );
}

function hasApiKeyFromConfig() {
  if (!existsSync(CONFIG_PATH)) return false;
  try {
    const c = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    return !!(c.ai?.anthropicApiKey || c.ai?.openaiApiKey || c.ai?.deepseekApiKey || c.ai?.ollamaUrl);
  } catch {
    return false;
  }
}

export async function doctor() {
  console.log('\nOpenBot Doctor\n');

  const checks = [
    {
      name: 'Node.js version ≥ 20',
      check: () => {
        const [major] = process.version.replace('v', '').split('.').map(Number);
        return { ok: major >= 20, detail: `Found: ${process.version}` };
      },
    },
    {
      name: 'Config file exists',
      check: () => ({ ok: existsSync(CONFIG_PATH), detail: existsSync(CONFIG_PATH) ? CONFIG_PATH : 'Optional — use .env or run: openbot onboard' }),
    },
    {
      name: 'API key configured',
      check: () => {
        const fromEnv = hasApiKeyFromEnv();
        const fromConfig = hasApiKeyFromConfig();
        const ok = fromEnv || fromConfig;
        const detail = ok ? (fromEnv && fromConfig ? '.env + config' : fromEnv ? '.env' : 'config file') : 'Missing — add to .env or run: openbot onboard';
        return { ok, detail };
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
