/**
 * OpenBot Onboarding Wizard
 * Matches OpenClaw's full interactive onboard flow.
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const DATA_DIR = join(HOME, '.openbot');
const CONFIG_PATH = join(DATA_DIR, 'config.json');
const OB_CONFIG = join(DATA_DIR, 'openbot.json');

function ask(rl, question, fallback = '') {
  return new Promise(resolve => {
    rl.question(question, ans => resolve(ans.trim() || fallback));
  });
}

function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function cyan(s) { return `\x1b[36m${s}\x1b[0m`; }
function dim(s) { return `\x1b[2m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }

function section(title) {
  console.log(`\n${bold('─'.repeat(50))}`);
  console.log(bold(` ${title}`));
  console.log(bold('─'.repeat(50)));
}

export async function onboard(opts = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log(`
${bold('╔════════════════════════════════════════════════╗')}
${bold('║')}     ${cyan('OpenBot')} — Your Personal AI Agent         ${bold('║')}
${bold('║')}     ${dim('Zero-setup · Any model · Any channel')}    ${bold('║')}
${bold('╚════════════════════════════════════════════════╝')}
`);

  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(join(DATA_DIR, 'memory'), { recursive: true });
  mkdirSync(join(DATA_DIR, 'conversations'), { recursive: true });
  mkdirSync(join(DATA_DIR, 'logs'), { recursive: true });

  let config = {};
  if (existsSync(CONFIG_PATH)) {
    try { config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')); }
    catch { config = {}; }
  }

  // ── Step 1: AI Provider ───────────────────────────────────────────────────
  section('Step 1 of 5 — AI Provider');
  console.log('');
  console.log(`  ${bold('1')}  ${cyan('Anthropic')} (Claude Sonnet)   — ${green('Recommended')}`);
  console.log(`  ${bold('2')}  ${cyan('OpenAI')} (GPT-4o)`);
  console.log(`  ${bold('3')}  ${cyan('DeepSeek')}                   — ${dim('Very affordable')}`);
  console.log(`  ${bold('4')}  ${cyan('OpenRouter')}                 — ${dim('200+ models, one key')}`);
  console.log(`  ${bold('5')}  ${cyan('Ollama')}                     — ${dim('Local, no API cost')}`);
  console.log(`  ${bold('6')}  ${cyan('Mistral AI')}`);
  console.log(`  ${bold('7')}  ${cyan('Custom')}                     — ${dim('Any OpenAI-compatible endpoint')}`);
  console.log('');

  const providerChoice = await ask(rl, `  Provider [1]: `, '1');
  const providers = {
    '1': { name: 'anthropic', model: 'claude-sonnet-4-6', keyEnv: 'ANTHROPIC_API_KEY', label: 'Anthropic', url: 'console.anthropic.com' },
    '2': { name: 'openai', model: 'gpt-4o', keyEnv: 'OPENAI_API_KEY', label: 'OpenAI', url: 'platform.openai.com' },
    '3': { name: 'deepseek', model: 'deepseek-chat', keyEnv: 'DEEPSEEK_API_KEY', label: 'DeepSeek', url: 'platform.deepseek.com' },
    '4': { name: 'openrouter', model: 'openrouter/auto', keyEnv: 'OPENROUTER_API_KEY', label: 'OpenRouter', url: 'openrouter.ai/keys' },
    '5': { name: 'ollama', model: 'ollama/llama3.3', keyEnv: null, label: 'Ollama', url: 'ollama.ai' },
    '6': { name: 'mistral', model: 'mistral-large', keyEnv: 'MISTRAL_API_KEY', label: 'Mistral', url: 'console.mistral.ai' },
    '7': { name: 'custom', model: null, keyEnv: null, label: 'Custom' },
  };
  const provider = providers[providerChoice] || providers['1'];

  config.ai = config.ai || {};

  if (provider.name === 'ollama') {
    const url = await ask(rl, `\n  Ollama base URL [http://localhost:11434]: `, 'http://localhost:11434');
    config.ai.ollamaUrl = url;
    config.ai.defaultModel = await ask(rl, `  Model [ollama/llama3.3]: `, 'ollama/llama3.3');
    console.log(green('\n  ✓ Ollama configured (no API key needed)'));
  } else if (provider.name === 'custom') {
    config.ai.customBaseUrl = await ask(rl, `\n  API base URL (e.g. http://localhost:8000/v1): `);
    config.ai.customApiKey = await ask(rl, `  API key (or press Enter for none): `);
    config.ai.defaultModel = await ask(rl, `  Model ID: `);
    console.log(green('\n  ✓ Custom provider configured'));
  } else {
    const envVal = process.env[provider.keyEnv];
    if (envVal) {
      console.log(green(`\n  ✓ Found ${provider.keyEnv} in environment`));
      config.ai.defaultModel = provider.model;
    } else {
      console.log(dim(`\n  Get your key at: ${provider.url}`));
      const apiKey = await ask(rl, `  ${provider.label} API key: `);
      if (apiKey) {
        const keyField = `${provider.name}ApiKey`;
        config.ai[keyField] = apiKey;
        console.log(green(`  ✓ Key saved`));
      } else {
        console.log(yellow(`  ⚠ Skipped — set ${provider.keyEnv} in .env later`));
      }
      config.ai.defaultModel = provider.model;
    }
  }

  // ── Step 2: Agent Name & Personality ─────────────────────────────────────
  section('Step 2 of 5 — Your Agent');
  console.log('');
  const agentName = await ask(rl, `  Agent name [OpenBot]: `, 'OpenBot');
  const userDesc = await ask(rl, `  Describe yourself briefly [a developer]: `, 'a developer');
  console.log(green(`  ✓ Agent "${agentName}" ready`));

  // ── Step 3: Messaging Channels ────────────────────────────────────────────
  section('Step 3 of 5 — Messaging Channels');
  console.log(dim('\n  Connect channels to chat from your phone/desktop apps.'));
  console.log(dim('  Press Enter to skip any channel.\n'));

  config.channels = config.channels || {};

  const tgToken = await ask(rl, `  Telegram bot token ${dim('(@BotFather → /newbot)')}: `);
  if (tgToken) { config.channels.telegram = { botToken: tgToken, dmPolicy: 'pairing' }; console.log(green('  ✓ Telegram configured')); }

  const discordToken = await ask(rl, `  Discord bot token ${dim('(discord.com/developers/applications)')}: `);
  if (discordToken) { config.channels.discord = { botToken: discordToken }; console.log(green('  ✓ Discord configured')); }

  const slackToken = await ask(rl, `  Slack bot token ${dim('(api.slack.com/apps)')}: `);
  if (slackToken) {
    const slackSigningSecret = await ask(rl, `  Slack signing secret: `);
    config.channels.slack = { botToken: slackToken, signingSecret: slackSigningSecret };
    console.log(green('  ✓ Slack configured'));
  }

  const moreChannels = await ask(rl, `\n  Configure more channels? (Signal, iMessage, WhatsApp…) [y/N]: `, 'n');
  if (moreChannels.toLowerCase() === 'y') {
    console.log(dim('\n  Add these to your .env file:'));
    console.log(dim('  SIGNAL_NUMBER=+1234567890   SIGNAL_API_URL=http://localhost:8080'));
    console.log(dim('  BLUEBUBBLES_URL=http://your-mac:1234   BLUEBUBBLES_PASSWORD=...'));
  }

  // ── Step 4: Gateway Port ──────────────────────────────────────────────────
  section('Step 4 of 5 — Gateway');
  console.log('');
  const port = parseInt(await ask(rl, `  Gateway port [18789]: `, '18789'));
  config.gateway = { port, host: '127.0.0.1' };
  console.log(green(`  ✓ Gateway on port ${port}`));

  // ── Step 5: Security ──────────────────────────────────────────────────────
  section('Step 5 of 5 — Security');
  console.log('');
  console.log('  DM Policy — how strangers can interact:\n');
  console.log(`  ${bold('1')}  ${cyan('pairing')}   ${green('(Recommended)')} — Unknown senders get a 6-digit code`);
  console.log(`  ${bold('2')}  ${cyan('allowlist')} — Only pre-approved users`);
  console.log(`  ${bold('3')}  ${cyan('open')}      — Anyone can message (risky)\n`);
  const policyChoice = await ask(rl, `  DM policy [1]: `, '1');
  const policies = { '1': 'pairing', '2': 'allowlist', '3': 'open' };
  const dmPolicy = policies[policyChoice] || 'pairing';
  config.channels.dmPolicy = dmPolicy;
  console.log(green(`  ✓ DM policy: ${dmPolicy}`));

  // ── Write configs ─────────────────────────────────────────────────────────
  config.security = {
    permissions: { shellEnabled: true, shellDenyList: ['rm -rf /', 'sudo rm', '> /dev/'] },
  };

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  // Write openbot.json (JSON5 format)
  const { writeOpenBotConfig } = await import('../../config/openbot-config.js');
  writeOpenBotConfig({
    gateway: { port, host: '127.0.0.1' },
    channels: { dmPolicy, ...config.channels },
    ai: { defaultModel: config.ai.defaultModel, failover: { enabled: true } },
  });

  // Update SOUL.md with agent name
  const soulPath = join(__dirname, '../../agents/default/SOUL.md');
  const userPath = join(__dirname, '../../agents/default/USER.md');
  const identityPath = join(__dirname, '../../agents/default/IDENTITY.md');

  writeFileSync(identityPath, `# IDENTITY.md — Who I Am\n\n## Name\n${agentName}\n\n## Vibe\nHelpful, direct, resourceful. Not a corporate drone.\n`);
  writeFileSync(userPath, `# USER.md — Who You're Helping\n\n## About Me\n- **Description**: ${userDesc}\n\n## Preferences\n- Communication style: direct and concise\n`);

  // Write .env file
  const envLines = ['# OpenBot Configuration — generated by onboard wizard', ''];
  if (config.ai.anthropicApiKey) envLines.push(`ANTHROPIC_API_KEY=${config.ai.anthropicApiKey}`);
  if (config.ai.openaiApiKey) envLines.push(`OPENAI_API_KEY=${config.ai.openaiApiKey}`);
  if (config.ai.deepseekApiKey) envLines.push(`DEEPSEEK_API_KEY=${config.ai.deepseekApiKey}`);
  if (config.ai.openrouterApiKey) envLines.push(`OPENROUTER_API_KEY=${config.ai.openrouterApiKey}`);
  if (config.ai.mistralApiKey) envLines.push(`MISTRAL_API_KEY=${config.ai.mistralApiKey}`);
  if (config.ai.ollamaUrl) envLines.push(`OLLAMA_BASE_URL=${config.ai.ollamaUrl}`);
  if (config.channels?.telegram?.botToken) envLines.push(`TELEGRAM_BOT_TOKEN=${config.channels.telegram.botToken}`);
  if (config.channels?.discord?.botToken) envLines.push(`DISCORD_BOT_TOKEN=${config.channels.discord.botToken}`);
  if (config.channels?.slack?.botToken) envLines.push(`SLACK_BOT_TOKEN=${config.channels.slack.botToken}`);
  envLines.push(`OPENBOT_MODEL=${config.ai.defaultModel}`);
  envLines.push(`GATEWAY_PORT=${port}`);

  const envPath = join(__dirname, '../../.env');
  writeFileSync(envPath, envLines.filter(Boolean).join('\n') + '\n');

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log(`
${bold('─'.repeat(50))}
${green('✓')} ${bold('OpenBot is ready!')}
${bold('─'.repeat(50))}

  Config:   ${dim(CONFIG_PATH)}
  Data:     ${dim(DATA_DIR)}

  ${bold('Start the gateway:')}
    ${cyan('node gateway/server.js')}

  ${bold('Open dashboard:')}
    ${cyan(`http://127.0.0.1:${port}`)}

  ${bold('Send a message:')}
    ${cyan('node cli/index.js agent -m "Hello!"')}

  ${bold('CLI commands:')}
    ${cyan('openbot doctor')}         — check setup
    ${cyan('openbot models list')}    — see AI models
    ${cyan('openbot channels status')} — check channels
    ${cyan('openbot cron list')}      — scheduled jobs
    ${cyan('openbot daemon start')}   — run in background

  ${dim('Need help? Check: README.md')}
`);

  if (opts.installDaemon) {
    console.log(dim('Starting gateway in background...'));
    const { spawn } = await import('child_process');
    const serverPath = join(__dirname, '../../gateway/server.js');
    const child = spawn('node', [serverPath], { detached: true, stdio: 'ignore' });
    child.unref();
    writeFileSync(join(DATA_DIR, 'gateway.pid'), String(child.pid));
    console.log(green(`✓ Gateway started (PID ${child.pid})`));
  }

  rl.close();
}
