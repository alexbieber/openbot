/**
 * OpenBot Daemon — manages the gateway as a system service.
 * Supports: start, stop, status, restart, install-service, uninstall-service
 * - macOS: launchd plist in ~/Library/LaunchAgents/
 * - Linux: systemd user service in ~/.config/systemd/user/
 * - Windows: Task Scheduler (schtasks) or NSSM
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import axios from 'axios';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const DATA_DIR = join(HOME, '.openbot');
const PID_FILE = join(DATA_DIR, 'gateway.pid');
const LOG_FILE = join(DATA_DIR, 'logs', 'gateway.log');
const ERR_FILE = join(DATA_DIR, 'logs', 'gateway-error.log');
const GW = `http://127.0.0.1:${process.env.GATEWAY_PORT || 18789}`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATEWAY_SCRIPT = join(__dirname, '../../gateway/server.js');
const NODE_BIN = process.execPath;

const green = s => `\x1b[32m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const bold = s => `\x1b[1m${s}\x1b[0m`;
const dim = s => `\x1b[2m${s}\x1b[0m`;
const cyan = s => `\x1b[36m${s}\x1b[0m`;

function readPid() {
  if (!existsSync(PID_FILE)) return null;
  try { return parseInt(readFileSync(PID_FILE, 'utf-8').trim()); } catch { return null; }
}
function writePid(pid) { writeFileSync(PID_FILE, String(pid)); }
function clearPid() { try { unlinkSync(PID_FILE); } catch {} }

function isRunning(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
async function isHealthy() {
  try { const r = await axios.get(`${GW}/health`, { timeout: 2000 }); return r.data?.status === 'ok'; }
  catch { return false; }
}

// ── macOS launchd plist ───────────────────────────────────────────────────────
function makePlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ai.openbot.gateway</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${GATEWAY_SCRIPT}</string>
  </array>
  <key>WorkingDirectory</key><string>${join(__dirname, '../..')}</string>
  <key>StandardOutPath</key><string>${LOG_FILE}</string>
  <key>StandardErrorPath</key><string>${ERR_FILE}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key><string>${HOME}</string>
  </dict>
</dict>
</plist>`;
}

// ── Linux systemd unit ────────────────────────────────────────────────────────
function makeSystemdUnit() {
  return `[Unit]
Description=OpenBot Gateway
After=network.target

[Service]
Type=simple
ExecStart=${NODE_BIN} ${GATEWAY_SCRIPT}
WorkingDirectory=${join(__dirname, '../..')}
Restart=on-failure
RestartSec=5
StandardOutput=append:${LOG_FILE}
StandardError=append:${ERR_FILE}
Environment=HOME=${HOME}

[Install]
WantedBy=default.target
`;
}

async function startDaemon() {
  const pid = readPid();
  if (pid && isRunning(pid)) {
    console.log(yellow(`Gateway already running (PID ${pid})`));
    return;
  }
  mkdirSync(join(DATA_DIR, 'logs'), { recursive: true });
  const { createWriteStream } = await import('fs');
  const out = createWriteStream(LOG_FILE, { flags: 'a' });
  const err = createWriteStream(ERR_FILE, { flags: 'a' });
  const child = spawn(NODE_BIN, [GATEWAY_SCRIPT], {
    detached: true, stdio: ['ignore', out, err],
    env: { ...process.env, HOME },
    cwd: join(__dirname, '../..'),
  });
  child.unref();
  writePid(child.pid);
  process.stdout.write('Starting gateway');
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 500));
    process.stdout.write('.');
    if (await isHealthy()) break;
  }
  console.log('');
  if (await isHealthy()) {
    console.log(green(`✓ Gateway started (PID ${child.pid})`));
    console.log(dim(`  Dashboard: http://127.0.0.1:${process.env.GATEWAY_PORT || 18789}`));
    console.log(dim(`  Logs: ${LOG_FILE}`));
  } else {
    console.log(yellow(`⚠ Gateway started (PID ${child.pid}) but health check failed`));
    console.log(dim(`  Check logs: ${LOG_FILE}`));
  }
}

async function stopDaemon() {
  const pid = readPid();
  if (!pid || !isRunning(pid)) { console.log(yellow('Gateway is not running')); clearPid(); return; }
  try {
    process.kill(pid, 'SIGTERM');
    await new Promise(r => setTimeout(r, 2000));
    if (isRunning(pid)) { process.kill(pid, 'SIGKILL'); await new Promise(r => setTimeout(r, 500)); }
    clearPid();
    console.log(green(`✓ Gateway stopped (PID ${pid})`));
  } catch (err) {
    console.error(red(`Failed to stop: ${err.message}`));
  }
}

async function daemonStatus() {
  const pid = readPid();
  const running = pid && isRunning(pid);
  const healthy = running && await isHealthy();
  console.log(`\nGateway: ${healthy ? green('● running') : running ? yellow('● started (unhealthy)') : red('● stopped')}`);
  if (pid) console.log(dim(`  PID: ${pid}`));
  if (running) {
    console.log(dim(`  URL: http://127.0.0.1:${process.env.GATEWAY_PORT || 18789}`));
    console.log(dim(`  Logs: ${LOG_FILE}`));
    // Service install status
    const svcInstalled = _checkServiceInstalled();
    console.log(dim(`  Service: ${svcInstalled ? green('installed (auto-start)') : 'not installed (manual only)'}`));
  }
  console.log();
}

function _checkServiceInstalled() {
  const pl = process.platform;
  if (pl === 'darwin') return existsSync(`${HOME}/Library/LaunchAgents/ai.openbot.gateway.plist`);
  if (pl === 'linux') return existsSync(`${HOME}/.config/systemd/user/openbot.service`);
  if (pl === 'win32') {
    try { execSync('schtasks /query /tn "OpenBot Gateway" /fo LIST', { stdio: 'pipe' }); return true; } catch { return false; }
  }
  return false;
}

async function installService() {
  const pl = process.platform;
  console.log(`\nInstalling OpenBot as a system service (${pl})...\n`);

  if (pl === 'darwin') {
    const plistDir = `${HOME}/Library/LaunchAgents`;
    const plistPath = `${plistDir}/ai.openbot.gateway.plist`;
    mkdirSync(plistDir, { recursive: true });
    writeFileSync(plistPath, makePlist());
    execSync(`launchctl load -w "${plistPath}"`);
    console.log(green('✓ launchd service installed'));
    console.log(dim(`  Auto-starts at login: ${plistPath}`));
    console.log(dim(`  Manage: launchctl stop ai.openbot.gateway`));

  } else if (pl === 'linux') {
    const svcDir = `${HOME}/.config/systemd/user`;
    const svcPath = `${svcDir}/openbot.service`;
    mkdirSync(svcDir, { recursive: true });
    writeFileSync(svcPath, makeSystemdUnit());
    try {
      execSync('systemctl --user daemon-reload');
      execSync('systemctl --user enable --now openbot.service');
      console.log(green('✓ systemd user service installed and started'));
      console.log(dim(`  Unit: ${svcPath}`));
      console.log(dim(`  Manage: systemctl --user stop openbot`));
    } catch {
      console.log(yellow(`✓ Service file written to ${svcPath}`));
      console.log(dim('  Run manually: systemctl --user daemon-reload && systemctl --user enable --now openbot'));
    }

  } else if (pl === 'win32') {
    const bat = join(DATA_DIR, 'openbot-gateway.bat');
    writeFileSync(bat, `@echo off\n"${NODE_BIN}" "${GATEWAY_SCRIPT}"\n`);
    const taskXml = `<?xml version="1.0"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>OpenBot Gateway</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>
  <Settings><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure></Settings>
  <Actions><Exec><Command>${NODE_BIN}</Command><Arguments>"${GATEWAY_SCRIPT}"</Arguments><WorkingDirectory>${join(__dirname, '../..')}</WorkingDirectory></Exec></Actions>
</Task>`;
    const taskFile = join(DATA_DIR, 'openbot-task.xml');
    writeFileSync(taskFile, taskXml);
    try {
      execSync(`schtasks /create /xml "${taskFile}" /tn "OpenBot Gateway" /f`, { stdio: 'pipe' });
      console.log(green('✓ Windows Task Scheduler task created'));
      console.log(dim('  Starts at login. Manage via Task Scheduler.'));
    } catch (e) {
      console.log(yellow('⚠ Could not create Task Scheduler entry (try running as Administrator)'));
      console.log(dim(`  Bat file: ${bat}`));
    }

  } else {
    console.log(yellow(`⚠ Auto-start not supported on ${pl}. Start manually with: openbot daemon start`));
  }
}

async function uninstallService() {
  const pl = process.platform;
  if (pl === 'darwin') {
    const plistPath = `${HOME}/Library/LaunchAgents/ai.openbot.gateway.plist`;
    if (existsSync(plistPath)) {
      try { execSync(`launchctl unload -w "${plistPath}"`); } catch {}
      unlinkSync(plistPath);
      console.log(green('✓ launchd service removed'));
    } else console.log(yellow('Service not installed'));
  } else if (pl === 'linux') {
    try { execSync('systemctl --user disable --now openbot.service'); } catch {}
    const svcPath = `${HOME}/.config/systemd/user/openbot.service`;
    if (existsSync(svcPath)) { unlinkSync(svcPath); execSync('systemctl --user daemon-reload'); }
    console.log(green('✓ systemd service removed'));
  } else if (pl === 'win32') {
    try { execSync('schtasks /delete /tn "OpenBot Gateway" /f', { stdio: 'pipe' }); console.log(green('✓ Task Scheduler task removed')); }
    catch { console.log(yellow('Task not found')); }
  }
}

export function registerDaemonCommands(program) {
  const register = (cmd) => {
    cmd.command('start').description('Start gateway in background').action(startDaemon);
    cmd.command('stop').description('Stop background gateway').action(stopDaemon);
    cmd.command('restart').description('Restart gateway').action(async () => { await stopDaemon(); await new Promise(r => setTimeout(r, 1000)); await startDaemon(); });
    cmd.command('status').description('Show daemon status').action(daemonStatus);
    cmd.command('install').description('Install as system service (auto-start at login)').action(installService);
    cmd.command('uninstall').description('Remove system service').action(uninstallService);
    cmd.command('logs').description('Tail gateway logs').option('-n, --lines <n>', 'Lines to show', '50').action(async (opts) => {
      if (!existsSync(LOG_FILE)) { console.log('No log file found.'); return; }
      const { readFileSync } = await import('fs');
      const lines = readFileSync(LOG_FILE, 'utf-8').split('\n');
      const n = parseInt(opts.lines);
      console.log(lines.slice(-n).join('\n'));
    });
  };

  const daemonCmd = program.command('daemon').description('Manage gateway daemon');
  const gatewayCmd = program.command('gateway').description('Manage gateway (alias for daemon)');
  register(daemonCmd);
  register(gatewayCmd);
}
