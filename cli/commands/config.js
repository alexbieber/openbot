// config.js
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CONFIG_PATH = join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.openbot', 'config.json');

export function configShow() {
  if (!existsSync(CONFIG_PATH)) { console.log('\n⚠️  No config found. Run: openbot onboard\n'); return; }
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  // Mask API keys
  if (config.ai?.anthropicApiKey) config.ai.anthropicApiKey = '***' + config.ai.anthropicApiKey.slice(-4);
  if (config.ai?.openaiApiKey) config.ai.openaiApiKey = '***' + config.ai.openaiApiKey.slice(-4);
  console.log('\n⚙️  Config:\n');
  console.log(JSON.stringify(config, null, 2));
  console.log('');
}

export function configSet(key, value) {
  let config = {};
  if (existsSync(CONFIG_PATH)) { try { config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')); } catch {} }
  const keys = key.split('.');
  let obj = config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]]) obj[keys[i]] = {};
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`\n✅ Set ${key} = ${value}\n`);
}
