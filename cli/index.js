#!/usr/bin/env node
/**
 * OpenBot CLI
 * Command-line interface for managing and interacting with your agent.
 * Matches OpenClaw's full CLI surface.
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();
program.name('openbot').description('OpenBot — Your personal AI agent').version(pkg.version);

// ── Core Commands ─────────────────────────────────────────────────────────────

// onboard
program.command('onboard')
  .description('Run the interactive setup wizard')
  .option('--install-daemon', 'Start gateway as background daemon after setup')
  .action(async (opts) => {
    const { onboard } = await import('./commands/onboard.js');
    await onboard(opts);
  });

// agent — send a message
program.command('agent')
  .description('Send a message to your agent')
  .option('-m, --message <text>', 'Message to send')
  .option('-a, --agent <id>', 'Agent ID', 'default')
  .option('--thinking <level>', 'Thinking level: low|medium|high', 'medium')
  .option('--stream', 'Stream the response token by token')
  .action(async (opts) => {
    const { agent } = await import('./commands/agent.js');
    await agent(opts);
  });

// message — alias for agent
program.command('message')
  .description('Send a message (alias for agent)')
  .option('-m, --message <text>', 'Message to send')
  .option('-a, --agent <id>', 'Agent ID', 'default')
  .action(async (opts) => {
    const { agent } = await import('./commands/agent.js');
    await agent(opts);
  });

// dashboard — open web UI in browser
program.command('dashboard')
  .description('Open the control dashboard in your browser')
  .action(async () => {
    const { spawn } = await import('child_process');
    const url = process.env.OPENBOT_GATEWAY?.replace('ws://', 'http://').replace('wss://', 'https://') || 'http://127.0.0.1:18789';
    console.log(`Opening ${url}`);
    const cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(cmd, [url], { shell: true, stdio: 'ignore' });
  });

// status — full system status (mirrors openclaw status)
program.command('status')
  .description('Show system status (gateway, channels, sessions)')
  .option('--all', 'Show full detail')
  .option('--deep', 'Probe the running gateway')
  .action(async (opts) => {
    const { status } = await import('./commands/status.js');
    await status(opts);
  });

// health — gateway health probe
program.command('health')
  .description('Health check: gateway + channel probes')
  .option('--json', 'Output as JSON')
  .option('--timeout <seconds>', 'Probe timeout in seconds', '10')
  .action(async (opts) => {
    const { health } = await import('./commands/health.js');
    await health(opts);
  });

// tui — terminal UI
program.command('tui')
  .description('Open interactive terminal chat UI')
  .option('-a, --agent <id>', 'Agent ID', 'default')
  .action(async (opts) => {
    const { tui } = await import('./commands/tui.js');
    await tui(opts);
  });

// ── Gateway & Daemon ──────────────────────────────────────────────────────────
const { registerDaemonCommands } = await import('./commands/daemon.js');
registerDaemonCommands(program);

// Legacy "gateway start" (inline)
const gatewayCmd = program.commands.find(c => c.name() === 'gateway');
if (!gatewayCmd) {
  const gw = program.command('gateway').description('Manage the gateway server');
  gw.command('start').action(async () => {
    const { spawn } = await import('child_process');
    const serverPath = join(__dirname, '..', 'gateway', 'server.js');
    const proc = spawn('node', [serverPath], { stdio: 'inherit' });
    proc.on('exit', code => process.exit(code || 0));
  });
  gw.command('status').action(async () => {
    const { gatewayStatus } = await import('./commands/gateway.js');
    await gatewayStatus();
  });
  gw.command('stop').action(async () => {
    const { gatewayStop } = await import('./commands/gateway.js');
    await gatewayStop();
  });
}

// ── Cron ──────────────────────────────────────────────────────────────────────
const { registerCronCommands } = await import('./commands/cron.js');
registerCronCommands(program);

// ── Models ────────────────────────────────────────────────────────────────────
const { registerModelsCommands } = await import('./commands/models.js');
registerModelsCommands(program);

// ── Channels ──────────────────────────────────────────────────────────────────
const { registerChannelsCommands } = await import('./commands/channels.js');
registerChannelsCommands(program);

// ── Sessions ──────────────────────────────────────────────────────────────────
const { registerSessionsCommands } = await import('./commands/sessions.js');
registerSessionsCommands(program);

// ── Logs ──────────────────────────────────────────────────────────────────────
const { registerLogsCommand } = await import('./commands/logs.js');
registerLogsCommand(program);

// ── Update ────────────────────────────────────────────────────────────────────
const { registerUpdateCommand } = await import('./commands/update.js');
registerUpdateCommand(program);

// ── Memory ────────────────────────────────────────────────────────────────────
const memory = program.command('memory').description('Manage long-term memory');
memory.command('list').option('-q, --query <text>', 'Filter by query').action(async opts => {
  const { memoryList } = await import('./commands/memory.js');
  await memoryList(opts);
});
memory.command('add <content>').action(async content => {
  const { memoryAdd } = await import('./commands/memory.js');
  await memoryAdd(content);
});
memory.command('delete <id>').action(async id => {
  const { memoryDelete } = await import('./commands/memory.js');
  await memoryDelete(id);
});
memory.command('search <query>').action(async query => {
  const { memoryList } = await import('./commands/memory.js');
  await memoryList({ query });
});
memory.command('status').action(async () => {
  const { memoryStatus } = await import('./commands/memory.js');
  await (memoryStatus ? memoryStatus() : memoryList({}));
});

// ── Skills ────────────────────────────────────────────────────────────────────
const skillsCmd = program.command('skills').description('Manage skills');
skillsCmd.command('list').action(async () => {
  const { skillsList } = await import('./commands/skills.js');
  await skillsList();
});
skillsCmd.command('install <name>').action(async name => {
  const { skillsInstall } = await import('./commands/skills.js');
  await skillsInstall(name);
});
skillsCmd.command('reload [name]').action(async name => {
  const axios = (await import('axios')).default;
  const gw = process.env.OPENBOT_GATEWAY || 'http://127.0.0.1:18789';
  await axios.post(`${gw}/skills/reload`, name ? { name } : {});
  console.log('Skills reloaded.');
});

// ── Agents (multi-agent management) ──────────────────────────────────────────
const agentsCmd = program.command('agents').description('Manage multiple agents');
agentsCmd.command('list').option('--bindings', 'Show channel bindings').action(async opts => {
  const { agents } = await import('./commands/agents.js');
  await agents('list', opts);
});
agentsCmd.command('add [id]').description('Create a new isolated agent').option('--id <id>').action(async (id, opts) => {
  const { agents } = await import('./commands/agents.js');
  await agents('add', { id, ...opts });
});
agentsCmd.command('show <id>').action(async (id) => {
  const { agents } = await import('./commands/agents.js');
  await agents('show', { id });
});
agentsCmd.command('remove <id>').action(async (id) => {
  const { agents } = await import('./commands/agents.js');
  await agents('remove', { id });
});

// ── Config ────────────────────────────────────────────────────────────────────
const configCmd = program.command('config').description('Manage configuration');
configCmd.command('show').action(async () => {
  const { configShow } = await import('./commands/config.js');
  await configShow();
});
configCmd.command('get <key>').action(async key => {
  const { configGet } = await import('./commands/config.js');
  if (configGet) await configGet(key);
});
configCmd.command('set <key> <value>').action(async (key, value) => {
  const { configSet } = await import('./commands/config.js');
  await configSet(key, value);
});

// configure — interactive config wizard
program.command('configure').description('Interactive config editor').action(async () => {
  const { onboard } = await import('./commands/onboard.js');
  await onboard({ configure: true });
});

// ── Security ──────────────────────────────────────────────────────────────────
const secCmd = program.command('security').description('Security audit and management');
secCmd.command('audit')
  .option('--deep', 'Deep scan including skill code analysis')
  .option('--fix', 'Auto-fix known issues')
  .action(async opts => {
    const { doctor } = await import('./commands/doctor.js');
    await doctor({ security: true, ...opts });
  });

// ── Doctor ────────────────────────────────────────────────────────────────────
program.command('doctor').description('Diagnose and repair installation issues').action(async () => {
  const { doctor } = await import('./commands/doctor.js');
  await doctor();
});

// ── Reset ─────────────────────────────────────────────────────────────────────
program.command('reset')
  .description('Reset OpenBot to factory defaults')
  .option('--confirm', 'Skip confirmation')
  .action(async opts => {
    if (!opts.confirm) {
      const { createInterface } = await import('readline');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      await new Promise(res => {
        rl.question('\x1b[31mThis will delete ALL data (~/.openbot/). Type "reset" to confirm: \x1b[0m', ans => {
          rl.close();
          if (ans !== 'reset') { console.log('Aborted.'); process.exit(0); }
          res();
        });
      });
    }
    const { rmSync } = await import('fs');
    const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
    rmSync(join(HOME, '.openbot'), { recursive: true, force: true });
    console.log('\x1b[32m✓ Reset complete. Run: openbot onboard\x1b[0m');
  });

// ── Webhooks (automation) ─────────────────────────────────────────────────────
const webhooksCmd2 = program.command('webhooks').description('Manage automation webhooks');
webhooksCmd2.command('list').action(async () => {
  const { webhooks } = await import('./commands/webhooks-cmd.js');
  await webhooks('list');
});
webhooksCmd2.command('add').option('--url <url>').option('--event <event>').option('--label <label>').action(async opts => {
  const { webhooks } = await import('./commands/webhooks-cmd.js');
  await webhooks('add', opts);
});
webhooksCmd2.command('remove <id>').action(async id => {
  const { webhooks } = await import('./commands/webhooks-cmd.js');
  await webhooks('remove', { _: [id] });
});
webhooksCmd2.command('test <id>').action(async id => {
  const { webhooks } = await import('./commands/webhooks-cmd.js');
  await webhooks('fire', { _: [id] });
});

// ── Approvals ─────────────────────────────────────────────────────────────────
const approvalsCmd = program.command('approvals').description('Manage exec approvals');
approvalsCmd.command('list').action(async () => {
  const { approvals } = await import('./commands/approvals.js');
  await approvals('list');
});
approvalsCmd.command('allow <binary>').action(async binary => {
  const { approvals } = await import('./commands/approvals.js');
  await approvals('allow', { binary });
});
approvalsCmd.command('remove <binary>').action(async binary => {
  const { approvals } = await import('./commands/approvals.js');
  await approvals('remove', { binary });
});
approvalsCmd.command('pending').action(async () => {
  const { approvals } = await import('./commands/approvals.js');
  await approvals('pending');
});
approvalsCmd.command('approve <id>').action(async id => {
  const { approvals } = await import('./commands/approvals.js');
  await approvals('approve', { _: [id] });
});

// ── Devices ───────────────────────────────────────────────────────────────────
const devicesCmd = program.command('devices').description('Manage paired devices');
devicesCmd.command('list').action(async () => {
  const { devices } = await import('./commands/devices.js');
  await devices('list');
});
devicesCmd.command('approve <id>').action(async id => {
  const { devices } = await import('./commands/devices.js');
  await devices('approve', { _: [id] });
});
devicesCmd.command('revoke <id>').action(async id => {
  const { devices } = await import('./commands/devices.js');
  await devices('revoke', { _: [id] });
});

// ── Message send (message send --message "text") ───────────────────────────────
const msgCmd = program.command('msg').description('Send a message to your agent');
msgCmd.command('send').option('-m, --message <text>').option('-a, --agent <id>').option('-t, --target <userId>').action(async opts => {
  const { message } = await import('./commands/message.js');
  await message('send', opts);
});
msgCmd.command('stream').option('-m, --message <text>').option('-a, --agent <id>').action(async opts => {
  const { message } = await import('./commands/message.js');
  await message('stream', opts);
});

// ── Plugins ───────────────────────────────────────────────────────────────────
const pluginsCmd = program.command('plugins').description('Manage gateway plugins');
pluginsCmd.command('list').action(async () => {
  const { plugins } = await import('./commands/plugins.js');
  await plugins('list');
});
pluginsCmd.command('install <path>').action(async path => {
  const { plugins } = await import('./commands/plugins.js');
  await plugins('install', { _: [path] });
});
pluginsCmd.command('remove <name>').action(async name => {
  const { plugins } = await import('./commands/plugins.js');
  await plugins('remove', { _: [name] });
});

// ── Hub (community marketplace) ───────────────────────────────────────────────
const { registerHubCommands } = await import('./commands/hub.js');
registerHubCommands(program);

// ── Security ──────────────────────────────────────────────────────────────────
const { registerSecurityCommands } = await import('./commands/security.js');
registerSecurityCommands(program);

// ── SSH / Multi-gateway ───────────────────────────────────────────────────────
const sshCmd = program.command('ssh').description('Multi-gateway SSH tunnel and discovery');
sshCmd.command('discover').description('Discover OpenBot gateways via ~/.ssh/config').action(async () => {
  const { discoverRemoteGateways } = await import('../gateway/ssh-manager.js');
  console.log('\nDiscovering remote OpenBot gateways...\n');
  const results = await discoverRemoteGateways();
  for (const r of results) {
    const status = r.gateway?.reachable ? `\x1b[32m● gateway v${r.gateway.version||'?'}\x1b[0m` : '\x1b[2mnot detected\x1b[0m';
    console.log(`  ${r.host.padEnd(30)} ${status}`);
  }
  console.log();
});
sshCmd.command('tunnel <host>').description('Open SSH tunnel to a remote gateway').option('-p, --port <n>', 'Remote gateway port', '18789').option('-l, --local-port <n>', 'Local tunnel port', '18799').action(async (host, opts) => {
  const { SSHTunnel } = await import('../gateway/ssh-manager.js');
  const tunnel = new SSHTunnel({ host, remotePort: parseInt(opts.port), localPort: parseInt(opts.localPort) });
  tunnel.start();
  console.log(`\x1b[32m✓ Tunnel open: ${tunnel.localUrl} → ${host}:${opts.port}\x1b[0m`);
  console.log('\x1b[2mCtrl+C to close tunnel\x1b[0m');
  process.on('SIGINT', () => { tunnel.stop(); process.exit(0); });
});

// ── Models auth ───────────────────────────────────────────────────────────────
const modelsAuthCmd = program.command('auth').description('Manage provider API keys and OAuth');
modelsAuthCmd.command('list').description('List configured providers').action(async () => {
  const gw = process.env.GATEWAY_PORT || 18789;
  try {
    const { default: axios } = await import('axios');
    const providers = (await axios.get(`http://127.0.0.1:${gw}/providers`, { timeout: 2000 })).data;
    console.log('\nProvider Auth Registry\n');
    for (const p of providers) {
      const status = p.configured ? '\x1b[32m✓ configured\x1b[0m' : '\x1b[2mnot set\x1b[0m';
      console.log(`  ${p.name.padEnd(20)} ${status}  ${'\x1b[2m'}(${p.type})\x1b[0m`);
    }
    console.log();
  } catch { console.log('\x1b[33mGateway not running\x1b[0m'); }
});
modelsAuthCmd.command('login <provider>').description('Add or update API key for a provider').action(async (provider) => {
  const { createInterface } = await import('readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`\nAPI key for ${provider}: `, async (key) => {
    rl.close();
    if (!key.trim()) { console.log('Cancelled.'); return; }
    const gw = process.env.GATEWAY_PORT || 18789;
    try {
      const { default: axios } = await import('axios');
      const res = await axios.post(`http://127.0.0.1:${gw}/providers/${provider}/login`, { apiKey: key.trim() }, { timeout: 3000 });
      console.log(`\x1b[32m✓ ${provider} configured\x1b[0m`);
    } catch { console.log('\x1b[33mGateway not running — key not saved to session\x1b[0m'); }
  });
});
modelsAuthCmd.command('logout <provider>').description('Remove API key for a provider').action(async (provider) => {
  const gw = process.env.GATEWAY_PORT || 18789;
  const { default: axios } = await import('axios').catch(() => ({ default: null }));
  if (!axios) return;
  await axios.delete(`http://127.0.0.1:${gw}/providers/${provider}`, { timeout: 2000 }).catch(() => {});
  console.log(`\x1b[32m✓ ${provider} removed\x1b[0m`);
});

// ── Obsidian sync ─────────────────────────────────────────────────────────────
const obsidianCmd = program.command('obsidian').description('Sync memory to Obsidian vault');
obsidianCmd.command('status').action(async () => {
  const gw = process.env.GATEWAY_PORT || 18789;
  const { default: axios } = await import('axios');
  const s = (await axios.get(`http://127.0.0.1:${gw}/obsidian/status`, { timeout: 2000 }).catch(() => ({ data: {} }))).data;
  console.log('\nObsidian Sync\n');
  console.log(`  Enabled: ${s.enabled ? '\x1b[32m✓ yes\x1b[0m' : '\x1b[2mnot configured\x1b[0m'}`);
  if (s.vault) console.log(`  Vault:   ${s.vault}/${s.folder}`);
  console.log(`  Raycast: ${s.raycast ? '\x1b[32m✓ enabled\x1b[0m' : 'disabled'}`);
  if (!s.enabled) console.log('\x1b[2m  Set OBSIDIAN_VAULT_PATH in .env to enable\x1b[0m');
  console.log();
});
obsidianCmd.command('sync').description('Sync all memories to vault now').action(async () => {
  const gw = process.env.GATEWAY_PORT || 18789;
  const { default: axios } = await import('axios');
  const r = (await axios.post(`http://127.0.0.1:${gw}/obsidian/sync`, {}, { timeout: 5000 }).catch(() => ({ data: { error: 'Gateway not running' } }))).data;
  if (r.ok) console.log(`\x1b[32m✓ Synced ${r.synced} memory files\x1b[0m`);
  else console.log(`\x1b[31m✗ ${r.error}\x1b[0m`);
});

// ── MCP ───────────────────────────────────────────────────────────────────────
const { registerMCPCommands } = await import('./commands/mcp.js');
registerMCPCommands(program);

program.parse();
