/**
 * Config Loader
 * Merges ~/.openbot/config.json with environment variables.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getHomeDir } from './paths.js';

const CONFIG_PATH = join(getHomeDir(), '.openbot', 'config.json');

export function loadConfig() {
  let fileConfig = {};
  if (existsSync(CONFIG_PATH)) {
    try { fileConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')); }
    catch (err) { console.warn('[Config] Failed to parse config.json:', err.message); }
  }

  // Environment variables override file config
  const envOverrides = {};

  if (process.env.ANTHROPIC_API_KEY) {
    envOverrides.ai = { ...fileConfig.ai, anthropicApiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    envOverrides.ai = { ...fileConfig.ai, openaiApiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    envOverrides.ai = { ...fileConfig.ai, deepseekApiKey: process.env.DEEPSEEK_API_KEY };
  }
  if (process.env.OPENBOT_MODEL) {
    envOverrides.ai = { ...(envOverrides.ai || fileConfig.ai), defaultModel: process.env.OPENBOT_MODEL };
  }
  if (process.env.GATEWAY_PORT) {
    envOverrides.gateway = { ...fileConfig.gateway, port: parseInt(process.env.GATEWAY_PORT) };
  }

  const merged = deepMerge(fileConfig, envOverrides);

  // Defaults
  // host: '0.0.0.0' = accept connections from LAN (needed for mobile app on same WiFi)
  merged.gateway = { port: 18789, host: '0.0.0.0', ...merged.gateway };
  merged.ai = { defaultModel: 'claude-sonnet-4-6', maxTokens: 4096, ...merged.ai };
  merged.security = {
    permissions: { shellEnabled: true, shellDenyList: [] },
    ...merged.security,
  };

  return merged;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
