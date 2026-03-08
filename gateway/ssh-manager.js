/**
 * SSH Manager — ClawdBot-parity multi-gateway SSH support.
 * Reads ~/.ssh/config to discover remote OpenBot gateways.
 * Enables remote tunnel creation and gateway-to-gateway rescue bot mode.
 *
 * Features:
 * - Auto-discover SSH targets from ~/.ssh/config
 * - Create SSH tunnels to remote gateways
 * - CLI: openbot daemon start --remote <host>
 * - Rescue bot mode: reroute messages to a remote gateway
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SSH_CONFIG_PATH = join(homedir(), '.ssh', 'config');

export function parseSSHConfig() {
  if (!existsSync(SSH_CONFIG_PATH)) return [];
  const content = readFileSync(SSH_CONFIG_PATH, 'utf-8');
  const hosts = [];
  let current = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split(/\s+/);
    const value = rest.join(' ');

    if (key.toLowerCase() === 'host') {
      if (current) hosts.push(current);
      current = { host: value, hostname: '', user: '', port: 22, identityFile: '', tags: [] };
    } else if (current) {
      const k = key.toLowerCase();
      if (k === 'hostname') current.hostname = value;
      else if (k === 'user') current.user = value;
      else if (k === 'port') current.port = parseInt(value);
      else if (k === 'identityfile') current.identityFile = value.replace('~', homedir());
      else if (k === '# openbot') current.tags.push(value.trim()); // e.g. # openbot port=18789
    }
  }
  if (current) hosts.push(current);

  // Filter for wildcard patterns
  return hosts.filter(h => !h.host.includes('*') && h.hostname);
}

export async function checkRemoteGateway(host, remotePort = 18789) {
  try {
    const result = execSync(
      `ssh -o ConnectTimeout=3 -o BatchMode=yes ${host} "curl -s http://localhost:${remotePort}/health 2>/dev/null"`,
      { timeout: 10000, encoding: 'utf-8', stdio: 'pipe' },
    );
    const data = JSON.parse(result.trim());
    return { reachable: true, ...data };
  } catch {
    return { reachable: false };
  }
}

export async function discoverRemoteGateways() {
  const hosts = parseSSHConfig();
  const results = [];
  for (const h of hosts.slice(0, 10)) { // limit scan
    const info = await checkRemoteGateway(h.host).catch(() => ({ reachable: false }));
    results.push({ ...h, gateway: info });
  }
  return results;
}

export class SSHTunnel {
  constructor({ host, remotePort = 18789, localPort = 18799 }) {
    this.host = host;
    this.remotePort = remotePort;
    this.localPort = localPort;
    this._proc = null;
  }

  start() {
    if (this._proc) return;
    this._proc = spawn('ssh', [
      '-N', '-L', `${this.localPort}:localhost:${this.remotePort}`,
      '-o', 'ExitOnForwardFailure=yes',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      this.host,
    ], { stdio: 'pipe' });

    this._proc.on('exit', (code) => {
      this._proc = null;
      if (code !== 0) console.warn(`[SSHTunnel] Tunnel to ${this.host} exited with code ${code}`);
    });

    console.log(`[SSHTunnel] Tunnel opened: localhost:${this.localPort} → ${this.host}:${this.remotePort}`);
    return this;
  }

  stop() {
    this._proc?.kill('SIGTERM');
    this._proc = null;
  }

  get localUrl() {
    return `http://localhost:${this.localPort}`;
  }

  isActive() {
    return this._proc?.exitCode === null;
  }
}
