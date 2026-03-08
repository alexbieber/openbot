import { createConnection } from 'net';

const COMMON_PORTS = [21,22,23,25,53,80,110,143,443,465,587,993,995,3000,3306,5432,5672,6379,8080,8443,8888,9200,27017];

function checkPort(host, port, timeout) {
  return new Promise(resolve => {
    const socket = createConnection({ host, port });
    socket.setTimeout(timeout);
    socket.on('connect', () => { socket.destroy(); resolve({ port, open: true }); });
    socket.on('error', () => resolve({ port, open: false }));
    socket.on('timeout', () => { socket.destroy(); resolve({ port, open: false }); });
  });
}

function parsePorts(portsStr) {
  if (!portsStr) return COMMON_PORTS;
  const result = [];
  for (const part of portsStr.split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      const lo = Math.min(a, b), hi = Math.min(Math.max(a, b), 65535);
      if (hi - lo > 2000) return { error: 'Range too large (max 2000 ports)' };
      for (let p = lo; p <= hi; p++) result.push(p);
    } else {
      const p = parseInt(part);
      if (!isNaN(p) && p > 0 && p <= 65535) result.push(p);
    }
  }
  return result.length ? result : COMMON_PORTS;
}

export default {
  name: 'port-scan',
  async run({ host, ports, timeout = 1000 }) {
    if (!host) return { ok: false, error: 'host required' };
    const portList = parsePorts(ports);
    if (portList.error) return { ok: false, error: portList.error };
    if (portList.length > 2000) return { ok: false, error: 'Too many ports to scan at once (max 2000)' };

    // Scan in batches of 50 to avoid overwhelming
    const batchSize = 50;
    const results = [];
    for (let i = 0; i < portList.length; i += batchSize) {
      const batch = portList.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(p => checkPort(host, p, timeout)));
      results.push(...batchResults);
    }

    const open = results.filter(r => r.open).map(r => r.port);
    const closed = results.filter(r => !r.open).map(r => r.port);
    return { ok: true, host, open, closed: closed.length, total: results.length, scanned: portList };
  },
};
