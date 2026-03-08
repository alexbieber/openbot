import { randomBytes, createHash } from 'crypto';

function v4() {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function v5(namespace, name) {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const nameBytes = Buffer.from(name, 'utf-8');
  const combined = Buffer.concat([nsBytes, nameBytes]);
  const hash = createHash('sha1').update(combined).digest();
  const b = hash.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function v7() {
  const ms = BigInt(Date.now());
  const b = randomBytes(16);
  b[0] = Number((ms >> 40n) & 0xffn);
  b[1] = Number((ms >> 32n) & 0xffn);
  b[2] = Number((ms >> 24n) & 0xffn);
  b[3] = Number((ms >> 16n) & 0xffn);
  b[4] = Number((ms >> 8n) & 0xffn);
  b[5] = Number(ms & 0xffn);
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default {
  name: 'uuid',
  async run({ action = 'generate', version = 4, count = 1, namespace, name, value }) {
    switch (action) {
      case 'generate': {
        const n = Math.min(count, 20);
        const gen = () => {
          if (version === 5) {
            if (!namespace || !name) return { error: 'namespace and name required for v5' };
            return v5(namespace, name);
          }
          if (version === 7) return v7();
          return v4(); // v1 falls back to v4
        };
        const uuids = Array.from({ length: n }, gen);
        return { ok: true, uuids: n === 1 ? undefined : uuids, uuid: n === 1 ? uuids[0] : undefined, version };
      }
      case 'validate': {
        if (!value) return { ok: false, error: 'value required' };
        const valid = UUID_RE.test(value);
        const ver = valid ? parseInt(value[14]) : null;
        return { ok: true, valid, version: ver, value };
      }
      case 'parse': {
        if (!value) return { ok: false, error: 'value required' };
        if (!UUID_RE.test(value)) return { ok: false, error: 'Invalid UUID' };
        const hex = value.replace(/-/g, '');
        const ver = parseInt(hex[12]);
        return { ok: true, version: ver, timeLow: hex.slice(0,8), timeMid: hex.slice(8,12), timeHiAndVersion: hex.slice(12,16), clockSeq: hex.slice(16,20), node: hex.slice(20) };
      }
      case 'nil':
        return { ok: true, uuid: '00000000-0000-0000-0000-000000000000' };
      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  },
};
