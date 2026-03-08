/**
 * CLI: openbot models
 *
 * openbot models list     — list all available models
 * openbot models set <m>  — set default model
 * openbot models status   — show current model + verify API key
 */

import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';

const GW = process.env.OPENBOT_GATEWAY || 'http://127.0.0.1:18789';

const KNOWN_MODELS = {
  anthropic: [
    { id: 'claude-opus-4-6', desc: 'Most capable Claude — best for complex tasks' },
    { id: 'claude-sonnet-4-6', desc: 'Fast and capable — recommended default' },
    { id: 'claude-haiku-3-5', desc: 'Fastest Claude — good for quick tasks' },
  ],
  openai: [
    { id: 'gpt-4o', desc: 'GPT-4o — multimodal, fast' },
    { id: 'gpt-4o-mini', desc: 'GPT-4o Mini — cheap and fast' },
    { id: 'gpt-5', desc: 'GPT-5 — most capable OpenAI model' },
    { id: 'o1', desc: 'o1 — extended thinking' },
    { id: 'o3', desc: 'o3 — strongest reasoning' },
  ],
  deepseek: [
    { id: 'deepseek-chat', desc: 'DeepSeek V3 — fast and cheap' },
    { id: 'deepseek-reasoner', desc: 'DeepSeek R1 — chain-of-thought reasoning' },
  ],
  openrouter: [
    { id: 'openrouter/auto', desc: 'Auto-select best model' },
    { id: 'meta-llama/llama-3.3-70b-instruct', desc: 'Llama 3.3 70B' },
    { id: 'google/gemini-2.0-flash-exp', desc: 'Gemini 2.0 Flash' },
    { id: 'mistralai/mistral-large', desc: 'Mistral Large' },
    { id: 'qwen/qwen-2.5-72b-instruct', desc: 'Qwen 2.5 72B' },
  ],
  ollama: [
    { id: 'ollama/llama3.3', desc: 'Llama 3.3 (local, no API key)' },
    { id: 'ollama/mistral', desc: 'Mistral (local, no API key)' },
    { id: 'ollama/gemma2', desc: 'Gemma 2 (local, no API key)' },
    { id: 'ollama/qwen2.5', desc: 'Qwen 2.5 (local, no API key)' },
  ],
  kimi: [
    { id: 'moonshot-v1-8k', desc: 'Kimi (Moonshot AI) — 8k context' },
    { id: 'moonshot-v1-32k', desc: 'Kimi (Moonshot AI) — 32k context' },
  ],
};

export function registerModelsCommands(program) {
  const cmd = program.command('models').description('Manage AI models');

  cmd.command('list')
    .description('List available models by provider')
    .action(() => {
      console.log(chalk.bold('\nAvailable Models:\n'));
      for (const [provider, models] of Object.entries(KNOWN_MODELS)) {
        const keyVar = {
          anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY',
          deepseek: 'DEEPSEEK_API_KEY', openrouter: 'OPENROUTER_API_KEY',
          ollama: '(no key needed)', kimi: 'KIMI_API_KEY',
        }[provider] || '';
        const hasKey = !keyVar.includes('no key') && !!process.env[keyVar];
        const providerLabel = `${chalk.cyan(provider.toUpperCase())} ${chalk.dim(`(${keyVar})`)} ${hasKey ? chalk.green('✓') : chalk.dim('not configured')}`;
        console.log(providerLabel);
        models.forEach(m => {
          console.log(`   ${chalk.white(m.id.padEnd(45))} ${chalk.dim(m.desc)}`);
        });
        console.log('');
      }
      const current = process.env.OPENBOT_MODEL || '(not set — using default)';
      console.log(`Current model: ${chalk.yellow(current)}`);
      console.log(`Set with: ${chalk.dim('openbot models set <model-id>')} or ${chalk.dim('OPENBOT_MODEL=... in .env')}\n`);
    });

  cmd.command('set <modelId>')
    .description('Set the default model')
    .action(async (modelId) => {
      const spin = ora(`Setting model to ${modelId}...`).start();
      try {
        await axios.post(`${GW}/config`, { key: 'ai.defaultModel', value: modelId }, { timeout: 5000 });
        spin.succeed(chalk.green(`Model set to: ${modelId}`));
        console.log(chalk.dim('Restart the gateway for changes to take full effect.'));
      } catch {
        // Fallback: write to .env in cwd
        const { readFileSync, writeFileSync, existsSync } = await import('fs');
        const envFile = '.env';
        let content = existsSync(envFile) ? readFileSync(envFile, 'utf-8') : '';
        if (content.includes('OPENBOT_MODEL=')) {
          content = content.replace(/^OPENBOT_MODEL=.*/m, `OPENBOT_MODEL=${modelId}`);
        } else {
          content += `\nOPENBOT_MODEL=${modelId}\n`;
        }
        writeFileSync(envFile, content);
        spin.succeed(chalk.green(`Model set to: ${modelId} (written to .env)`));
      }
    });

  cmd.command('status')
    .description('Show current model and API key status')
    .action(async () => {
      const spin = ora('Checking model status...').start();
      try {
        const health = await axios.get(`${GW}/health`, { timeout: 5000 });
        spin.stop();
        const model = health.data.model || process.env.OPENBOT_MODEL || 'unknown';
        console.log(`\nCurrent model: ${chalk.yellow(model)}`);
        console.log(`Gateway: ${chalk.green('online')} (uptime: ${Math.round(health.data.uptime)}s)`);

        const keys = [
          ['Anthropic', 'ANTHROPIC_API_KEY'], ['OpenAI', 'OPENAI_API_KEY'],
          ['DeepSeek', 'DEEPSEEK_API_KEY'], ['OpenRouter', 'OPENROUTER_API_KEY'],
          ['Kimi', 'KIMI_API_KEY'], ['Ollama', '(local)'],
        ];
        console.log('\nAPI Keys:');
        keys.forEach(([name, key]) => {
          const has = key === '(local)' ? true : !!process.env[key];
          console.log(`   ${has ? chalk.green('✓') : chalk.dim('✗')} ${name}`);
        });
        console.log('');
      } catch {
        spin.stop();
        console.log(`\nCurrent model: ${chalk.yellow(process.env.OPENBOT_MODEL || 'claude-sonnet-4-6 (default)')}`);
        console.log(`Gateway: ${chalk.red('offline')}\n`);
      }
    });
}
