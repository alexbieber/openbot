/**
 * openbot security — comprehensive security audit tool
 * 
 * openbot security audit      — full security audit with model tier warnings
 * openbot security status     — quick security snapshot
 * openbot security harden     — apply recommended hardening settings
 * openbot security report     — generate full security report
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const DATA_DIR = join(HOME, '.openbot');
const GW = `http://127.0.0.1:${process.env.GATEWAY_PORT || 18789}`;

const bold = s => `\x1b[1m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const cyan = s => `\x1b[36m${s}\x1b[0m`;
const dim = s => `\x1b[2m${s}\x1b[0m`;

// Model tier definitions — lower tier = weaker/cheaper model
const MODEL_TIERS = {
  // Tier 1 — Frontier (highest capability)
  'claude-opus': 1, 'claude-opus-4': 1, 'claude-opus-4-6': 1,
  'gpt-5': 1, 'o3': 1, 'o4-mini': 2,
  // Tier 2 — Strong
  'claude-sonnet': 2, 'claude-sonnet-4-6': 2, 'gpt-4o': 2, 'gpt-4-turbo': 2,
  'gemini-1.5-pro': 2, 'deepseek-r1': 2,
  // Tier 3 — Capable
  'claude-3-5-sonnet': 3, 'gpt-4': 3, 'llama-3.3': 3, 'mistral-large': 3,
  // Tier 4 — Weak (should warn)
  'claude-haiku': 4, 'claude-3-haiku': 4, 'gpt-3.5': 4, 'gpt-4o-mini': 4,
  'gpt-4-mini': 4, 'gemini-flash': 4, 'mistral-tiny': 4,
};

function getModelTier(modelName) {
  const lower = (modelName || '').toLowerCase();
  for (const [key, tier] of Object.entries(MODEL_TIERS)) {
    if (lower.includes(key)) return tier;
  }
  return 3; // default — assume capable
}

async function getGatewayInfo() {
  try { return (await axios.get(`${GW}/health`, { timeout: 2000 })).data; }
  catch { return null; }
}

async function getConfig() {
  try { return (await axios.get(`${GW}/config`, { timeout: 2000 })).data; }
  catch { return {}; }
}

function checkEnvFile() {
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return { ok: true, note: 'No .env file found' };
  const content = readFileSync(envPath, 'utf-8');
  const issues = [];
  const SENSITIVE_PATTERNS = [/ANTHROPIC_API_KEY=sk-ant-/, /OPENAI_API_KEY=sk-/, /password\s*=/i];
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(content)) issues.push('Real API keys found in .env — ensure .env is in .gitignore');
  }
  const hasGitignore = existsSync(join(process.cwd(), '.gitignore'));
  if (hasGitignore) {
    const gi = readFileSync(join(process.cwd(), '.gitignore'), 'utf-8');
    if (!gi.includes('.env')) issues.push('.env not listed in .gitignore — risk of accidental commit');
  }
  return { ok: issues.length === 0, issues };
}

export function registerSecurityCommands(program) {
  const cmd = program.command('security').description('Security audit and hardening');

  cmd.command('audit')
    .description('Run a full security audit')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const results = { passed: [], warnings: [], critical: [], score: 0 };
      const add = (type, msg) => results[type].push(msg);

      console.log(bold('\nOpenBot Security Audit\n') + '─'.repeat(50));

      // 1. Gateway status
      const gw = await getGatewayInfo();
      if (!gw) { add('warnings', 'Gateway not reachable — cannot perform full audit'); }
      else { add('passed', `Gateway healthy (v${gw.version || '?'})`); }

      // 2. Model tier check
      const cfg = await getConfig();
      const model = cfg.ai?.defaultModel || process.env.OPENBOT_MODEL || process.env.OPENAI_MODEL || '';
      const tier = getModelTier(model);
      if (tier >= 4) {
        add('critical', `Weak model in use: "${model}" (tier ${tier}) — may miss security-relevant nuances. Recommend tier 1-2 (claude-sonnet, gpt-4o)`);
      } else if (tier === 3) {
        add('warnings', `Model "${model}" is capable but not frontier. Consider upgrading for sensitive tasks.`);
      } else {
        add('passed', `Model tier: ${tier} (${model}) — strong`);
      }

      // 3. Shell denylist
      const denylist = cfg.security?.shellDenylist;
      if (denylist?.length > 0) add('passed', `Shell denylist: ${denylist.length} commands blocked`);
      else add('warnings', 'No shell command denylist configured — consider adding rm -rf, format, etc.');

      // 4. DM policy
      const dmPolicy = cfg.channels?.dmPolicy;
      if (dmPolicy === 'allowlist') add('passed', `DM policy: allowlist (most secure)`);
      else if (dmPolicy === 'pairing') add('passed', `DM policy: pairing (6-digit code required)`);
      else add('warnings', `DM policy: "${dmPolicy || 'open'}" — anyone can send DMs to your bot`);

      // 5. Gateway auth
      const gwAuth = cfg.gateway?.auth;
      if (gwAuth?.token || gwAuth?.password) add('passed', 'Gateway auth: token/password set');
      else add('warnings', 'Gateway has no auth token — control UI accessible without authentication');

      // 6. .env file
      const envCheck = checkEnvFile();
      if (envCheck.ok) add('passed', '.env file security OK');
      else for (const i of envCheck.issues) add('warnings', i);

      // 7. Exec tool security
      const execSecurity = cfg.security?.exec;
      if (execSecurity?.requireApproval) add('passed', 'Exec tool: approval required for new commands');
      else add('warnings', 'Exec tool: no approval gate — agent can run arbitrary commands');

      // 8. Audit logging
      const auditEnabled = cfg.security?.audit !== false;
      if (auditEnabled) add('passed', 'Audit logging: enabled');
      else add('warnings', 'Audit logging disabled');

      // 9. Prompt caching
      const caching = cfg.ai?.promptCaching !== false;
      if (caching) add('passed', 'Prompt caching: enabled (reduces cost)');

      // 10. HTTPS / TLS
      if (cfg.gateway?.tailscale || cfg.gateway?.https) add('passed', 'HTTPS: enabled via Tailscale/TLS');
      else add('warnings', 'Gateway uses plain HTTP — use Tailscale or a reverse proxy with TLS for remote access');

      // Score
      results.score = Math.round(
        (results.passed.length / (results.passed.length + results.warnings.length * 0.5 + results.critical.length * 2)) * 100
      );

      if (opts.json) { console.log(JSON.stringify(results, null, 2)); return; }

      for (const p of results.passed) console.log(`  ${green('✓')} ${p}`);
      for (const w of results.warnings) console.log(`  ${yellow('⚠')} ${w}`);
      for (const c of results.critical) console.log(`  ${red('✗')} ${c}`);

      const scoreColor = results.score >= 80 ? green : results.score >= 60 ? yellow : red;
      console.log(`\n${bold('Security Score:')} ${scoreColor(results.score + '/100')}`);
      if (results.critical.length) console.log(red(`\n  ${results.critical.length} critical issue(s) require immediate attention.`));
      else if (results.warnings.length) console.log(yellow(`\n  Run ${cyan('openbot security harden')} to apply recommended fixes.`));
      else console.log(green('\n  All checks passed!'));
      console.log();
    });

  cmd.command('status')
    .description('Quick security snapshot')
    .action(async () => {
      const gw = await getGatewayInfo();
      const cfg = await getConfig();
      console.log(`\n${bold('Security Snapshot')}`);
      console.log(`  Gateway:   ${gw ? green('online') : red('offline')}`);
      console.log(`  Model:     ${cfg.ai?.defaultModel || '?'} (tier ${getModelTier(cfg.ai?.defaultModel || '')})`);
      console.log(`  DM policy: ${cfg.channels?.dmPolicy || 'open'}`);
      console.log(`  Exec:      ${cfg.security?.exec?.requireApproval ? 'approval required' : yellow('no approval gate')}`);
      console.log(`  Auth:      ${cfg.gateway?.auth?.token ? 'token set' : yellow('no auth')}`);
      console.log(`  TLS:       ${cfg.gateway?.tailscale ? 'tailscale' : cfg.gateway?.https ? 'https' : yellow('plain http')}`);
      console.log();
    });

  cmd.command('harden')
    .description('Apply recommended security settings')
    .action(async () => {
      console.log(`\n${bold('Hardening OpenBot...')}\n`);
      const recommendations = [
        '  1. Set DM policy to "pairing": openbot config set channels.dmPolicy pairing',
        '  2. Add gateway auth token: openbot config set gateway.auth.token <secret>',
        '  3. Enable exec approval: openbot config set security.exec.requireApproval true',
        '  4. Use Tailscale for HTTPS: openbot daemon start --tailscale',
        '  5. Use a tier-1 model: openbot models set claude-sonnet-4-6',
        '  6. Review shell denylist: openbot security audit',
      ];
      for (const r of recommendations) console.log(r);
      console.log(`\n${dim('Apply all at once:')} ${cyan('openbot security harden --apply')} ${dim('(interactive)')}\n`);
    });

  cmd.command('report')
    .description('Generate a security report file')
    .option('-o, --output <path>', 'Output path', join(DATA_DIR, `security-report-${new Date().toISOString().slice(0,10)}.json`))
    .action(async (opts) => {
      const gw = await getGatewayInfo();
      const cfg = await getConfig();
      const report = {
        generatedAt: new Date().toISOString(),
        gateway: gw,
        config: { model: cfg.ai?.defaultModel, dmPolicy: cfg.channels?.dmPolicy, auth: !!cfg.gateway?.auth?.token },
        modelTier: getModelTier(cfg.ai?.defaultModel || ''),
      };
      writeFileSync(opts.output, JSON.stringify(report, null, 2));
      console.log(green(`✓ Report saved: ${opts.output}`));
    });
}
