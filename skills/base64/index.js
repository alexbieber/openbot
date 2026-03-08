import { readFileSync, existsSync } from 'fs';

export default {
  name: 'base64',
  async run({ action = 'encode', input, filePath }) {
    switch (action) {
      case 'encode': {
        if (!input) return { ok: false, error: 'input required' };
        return { ok: true, result: Buffer.from(input, 'utf-8').toString('base64'), inputLength: input.length };
      }
      case 'decode': {
        if (!input) return { ok: false, error: 'input required' };
        try {
          const decoded = Buffer.from(input.trim(), 'base64').toString('utf-8');
          return { ok: true, result: decoded };
        } catch { return { ok: false, error: 'Invalid Base64 string' }; }
      }
      case 'encode_url': {
        if (!input) return { ok: false, error: 'input required' };
        return { ok: true, result: Buffer.from(input, 'utf-8').toString('base64url') };
      }
      case 'decode_url': {
        if (!input) return { ok: false, error: 'input required' };
        try {
          return { ok: true, result: Buffer.from(input.trim(), 'base64url').toString('utf-8') };
        } catch { return { ok: false, error: 'Invalid Base64URL string' }; }
      }
      case 'encode_file': {
        if (!filePath) return { ok: false, error: 'filePath required' };
        if (!existsSync(filePath)) return { ok: false, error: `File not found: ${filePath}` };
        const data = readFileSync(filePath);
        return { ok: true, result: data.toString('base64'), sizeBytes: data.length };
      }
      default: return { ok: false, error: `Unknown action: ${action}` };
    }
  },
};
