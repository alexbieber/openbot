/**
 * System Monitor Skill
 * CPU, memory, disk, processes, network via Node.js os module + shell.
 */
import os from 'os';
import { execSync } from 'child_process';

function fmtBytes(bytes) {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function getCpuUsage() {
  const cpus = os.cpus();
  const avg = cpus.reduce((acc, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    const idle = cpu.times.idle;
    return acc + (1 - idle / total) * 100;
  }, 0) / cpus.length;
  return { cores: cpus.length, model: cpus[0]?.model?.trim(), usage: avg.toFixed(1) };
}

function getMemory() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return { total, free, used, pct: ((used / total) * 100).toFixed(1) };
}

function getDisk() {
  try {
    const isWin = process.platform === 'win32';
    if (isWin) {
      const out = execSync('wmic logicaldisk get size,freespace,caption', { timeout: 5000 }).toString();
      const lines = out.trim().split('\n').slice(1).filter(l => l.trim());
      return lines.map(l => {
        const parts = l.trim().split(/\s+/);
        const drive = parts[0]; const free = parseInt(parts[1]); const size = parseInt(parts[2]);
        if (!size) return null;
        return `${drive} — ${fmtBytes(size - free)} used / ${fmtBytes(size)} total (${(((size - free) / size) * 100).toFixed(0)}%)`;
      }).filter(Boolean).join('\n');
    }
    const out = execSync('df -h / 2>/dev/null || df -h', { timeout: 5000 }).toString();
    const lines = out.trim().split('\n').slice(1, 4);
    return lines.map(l => {
      const p = l.trim().split(/\s+/);
      return `${p[5] || p[0]} — ${p[2]} used / ${p[1]} total (${p[4]})`;
    }).join('\n');
  } catch { return 'Disk info unavailable'; }
}

function getProcesses() {
  try {
    const isWin = process.platform === 'win32';
    const cmd = isWin
      ? 'powershell "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 | Format-Table Name,CPU,WorkingSet -AutoSize"'
      : 'ps aux --sort=-%cpu | head -11';
    return execSync(cmd, { timeout: 5000 }).toString().trim();
  } catch { return 'Process list unavailable'; }
}

function getNetwork() {
  const ifaces = os.networkInterfaces();
  const result = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    const v4 = addrs?.find(a => a.family === 'IPv4' && !a.internal);
    if (v4) result.push(`${name}: ${v4.address}`);
  }
  return result.join('\n') || 'No active network interfaces';
}

function getInfo() {
  return `OS: ${os.type()} ${os.release()} (${os.arch()})
Hostname: ${os.hostname()}
Uptime: ${(os.uptime() / 3600).toFixed(1)} hours
CPUs: ${os.cpus().length}x ${os.cpus()[0]?.model?.trim()}
Node.js: ${process.version}
Platform: ${process.platform}`;
}

export default async function execute({ action }) {
  switch (action) {
    case 'cpu': {
      const c = getCpuUsage();
      return `CPU: ${c.usage}% average across ${c.cores} cores\nModel: ${c.model}`;
    }
    case 'memory': {
      const m = getMemory();
      return `RAM: ${fmtBytes(m.used)} used / ${fmtBytes(m.total)} total (${m.pct}% used)\nFree: ${fmtBytes(m.free)}`;
    }
    case 'disk': return `Disk:\n${getDisk()}`;
    case 'processes': return `Top Processes:\n${getProcesses()}`;
    case 'network': return `Network Interfaces:\n${getNetwork()}`;
    case 'info': return getInfo();
    case 'all': {
      const c = getCpuUsage(); const m = getMemory();
      return `System Report:\n\n${getInfo()}\n\nCPU: ${c.usage}% (${c.cores} cores)\nRAM: ${fmtBytes(m.used)} / ${fmtBytes(m.total)} (${m.pct}%)\nDisk:\n${getDisk()}\nNetwork:\n${getNetwork()}`;
    }
    default: throw new Error(`Unknown action: ${action}. Use: cpu, memory, disk, processes, network, info, all`);
  }
}
