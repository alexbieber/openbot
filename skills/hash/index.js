import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { readFileSync, existsSync } from 'fs';

export default {
  name: 'hash',
  async run({ action = 'hash', input, algorithm = 'sha256', key, filePath, compareWith }) {
    switch (action) {
      case 'hash': {
        if (!input) return { ok: false, error: 'input required' };
        try {
          const h = createHash(algorithm).update(input, 'utf-8').digest('hex');
          return { ok: true, hash: h, algorithm, inputLength: input.length };
        } catch { return { ok: false, error: `Unsupported algorithm: ${algorithm}` }; }
      }
      case 'hmac': {
        if (!input || !key) return { ok: false, error: 'input and key required' };
        const h = createHmac(algorithm, key).update(input).digest('hex');
        return { ok: true, hmac: h, algorithm };
      }
      case 'compare': {
        if (!input || !compareWith) return { ok: false, error: 'input and compareWith required' };
        const h = createHash(algorithm).update(input).digest('hex');
        const a = Buffer.from(h, 'hex');
        const b = Buffer.from(compareWith.toLowerCase(), 'hex');
        const match = a.length === b.length && timingSafeEqual(a, b);
        return { ok: true, match, computed: h, expected: compareWith.toLowerCase() };
      }
      case 'file': {
        if (!filePath) return { ok: false, error: 'filePath required' };
        if (!existsSync(filePath)) return { ok: false, error: `File not found: ${filePath}` };
        const data = readFileSync(filePath);
        const h = createHash(algorithm).update(data).digest('hex');
        return { ok: true, hash: h, algorithm, filePath, sizeBytes: data.length };
      }
      default: return { ok: false, error: `Unknown action: ${action}` };
    }
  },
};
