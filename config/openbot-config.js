/**
 * openbot.json — JSON5 config system with strict validation and hot-reload
 * Lives at: ~/.openbot/openbot.json
 *
 * Matches OpenClaw's ~/.openclaw/openclaw.json schema and behavior.
 * JSON5: supports comments, trailing commas, unquoted keys.
 * Hot-reload: file watcher updates config without restart (except gateway port/host).
 */

import JSON5 from 'json5';
import { readFileSync, existsSync, mkdirSync, writeFileSync, watchFile } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const CONFIG_FILE = join(HOME, '.openbot', 'openbot.json');

// ── Default config (matches OpenClaw schema) ─────────────────────────────────
const DEFAULTS = {
  gateway: {
    port: 18789,
    host: '127.0.0.1',
    auth: { mode: 'none' }, // 'none' | 'token'
  },
  agents: {
    defaults: {
      model: 'claude-sonnet-4-6',
      workspace: join(HOME, '.openbot', 'workspace'),
      timeoutSeconds: 600,
      sandbox: { mode: 'none' }, // 'none' | 'docker'
    },
    list: [],
  },
  channels: {
    dmPolicy: 'pairing', // 'open' | 'pairing' | 'allowlist'
    telegram: { enabled: false },
    discord: { enabled: false },
    slack: { enabled: false },
    whatsapp: { enabled: false },
    signal: { enabled: false },
    imessage: { enabled: false },
    matrix: { enabled: false },
    teams: { enabled: false },
    googlechat: { enabled: false },
    line: { enabled: false },
    mattermost: { enabled: false },
    irc: { enabled: false },
    feishu: { enabled: false },
    zalo: { enabled: false },
  },
  skills: {
    entries: {},
    load: { watch: true, watchDebounceMs: 250 },
  },
  memory: {
    provider: 'markdown', // 'markdown' | 'sqlite-vec'
    maxResults: 10,
  },
  tools: {
    profile: 'default', // 'default' | 'messaging' | 'coding' | 'minimal'
    deny: [],
  },
  cron: {},
  update: {
    channel: 'stable',
    auto: { enabled: false },
  },
  ai: {
    defaultModel: 'claude-sonnet-4-6',
    maxTokens: 4096,
    failover: { enabled: true },
  },
};

// ── Validation schema ─────────────────────────────────────────────────────────
const VALID_KEYS = new Set([
  'gateway', 'agents', 'channels', 'skills', 'memory', 'tools', 'cron', 'update', 'ai',
]);

function validateConfig(config) {
  const errors = [];

  if (config.gateway?.port && (typeof config.gateway.port !== 'number' || config.gateway.port < 1 || config.gateway.port > 65535)) {
    errors.push('gateway.port must be a number between 1 and 65535');
  }

  const validPolicies = ['open', 'pairing', 'allowlist'];
  if (config.channels?.dmPolicy && !validPolicies.includes(config.channels.dmPolicy)) {
    errors.push(`channels.dmPolicy must be one of: ${validPolicies.join(', ')}`);
  }

  if (config.ai?.maxTokens && (typeof config.ai.maxTokens !== 'number' || config.ai.maxTokens < 100)) {
    errors.push('ai.maxTokens must be a number >= 100');
  }

  for (const key of Object.keys(config)) {
    if (!VALID_KEYS.has(key)) {
      errors.push(`Unknown config key: "${key}"`);
    }
  }

  return errors;
}

// ── Config loader ─────────────────────────────────────────────────────────────
function deepMerge(base, override) {
  const result = { ...base };
  for (const [k, v] of Object.entries(override || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof result[k] === 'object') {
      result[k] = deepMerge(result[k], v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

export function loadOpenBotConfig() {
  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULTS, _source: 'defaults' };
  }

  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON5.parse(raw);
    const errors = validateConfig(parsed);
    if (errors.length) {
      console.warn('[Config] Validation warnings:');
      errors.forEach(e => console.warn(`  ⚠ ${e}`));
    }
    return deepMerge(DEFAULTS, parsed);
  } catch (err) {
    console.error(`[Config] Failed to parse openbot.json: ${err.message}`);
    console.error('[Config] Run: openbot doctor');
    return { ...DEFAULTS, _source: 'defaults' };
  }
}

// ── Config hot-reload watcher ─────────────────────────────────────────────────
export function watchConfig(onChange) {
  if (!existsSync(CONFIG_FILE)) return;

  watchFile(CONFIG_FILE, { interval: 1000 }, () => {
    try {
      const newConfig = loadOpenBotConfig();
      onChange(newConfig);
      console.log('[Config] Reloaded (hot-reload)');
    } catch (err) {
      console.error('[Config] Hot-reload failed:', err.message);
    }
  });
}

// ── Config writer ─────────────────────────────────────────────────────────────
export function writeOpenBotConfig(config) {
  mkdirSync(join(HOME, '.openbot'), { recursive: true });
  const comment = `// OpenBot Configuration\n// Edit this file to configure your agent.\n// JSON5 format: comments allowed, trailing commas OK.\n// Run 'openbot doctor' to diagnose issues.\n\n`;
  writeFileSync(CONFIG_FILE, comment + JSON5.stringify(config, null, 2));
}

export { DEFAULTS, validateConfig, CONFIG_FILE };
