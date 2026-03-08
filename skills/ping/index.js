import { execSync } from 'child_process';
import { platform } from 'os';

export default {
  name: 'ping',
  async run({ host, count = 4, timeout = 3000 }) {
    if (!host) return { ok: false, error: 'host required' };
    const n = Math.min(count, 10);
    const isWin = platform() === 'win32';

    try {
      let cmd;
      if (isWin) {
        cmd = `ping -n ${n} -w ${timeout} ${host}`;
      } else {
        cmd = `ping -c ${n} -W ${Math.ceil(timeout / 1000)} ${host}`;
      }

      const out = execSync(cmd, { encoding: 'utf-8', timeout: (timeout * n) + 5000 });
      // Parse statistics
      const times = [];
      const timeMatches = out.matchAll(/time[=<](\d+(?:\.\d+)?)\s*ms/gi);
      for (const m of timeMatches) times.push(parseFloat(m[1]));

      const stats = times.length > 0 ? {
        min: Math.min(...times).toFixed(2),
        max: Math.max(...times).toFixed(2),
        avg: (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2),
        count: times.length,
      } : null;

      const lossMatch = out.match(/(\d+)%\s+(?:packet\s+)?loss/i);
      const packetLoss = lossMatch ? parseInt(lossMatch[1]) : null;

      return { ok: true, host, reachable: times.length > 0, stats, packetLoss, output: out.trim().split('\n').slice(-5).join('\n') };
    } catch (err) {
      return { ok: false, host, reachable: false, error: err.message };
    }
  },
};
