import { randomBytes, randomInt } from 'crypto';

const CHARSETS = {
  all: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?',
  alphanumeric: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  alpha: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numeric: '0123456789',
  hex: '0123456789abcdef',
  symbols: '!@#$%^&*()-_=+[]{}|;:,.<>?',
};

const WORDS = ['correct','horse','battery','staple','apple','table','beach','cloud','delta','eagle','flame','globe','honey','ivory','japan','knife','lemon','mango','night','ocean','piano','quest','river','solar','tiger','ultra','vital','water','xenon','yacht','zebra'];

function genPassword(length, charset) {
  const chars = CHARSETS[charset] || CHARSETS.all;
  return Array.from({ length }, () => chars[randomInt(chars.length)]).join('');
}

function checkStrength(pwd) {
  let score = 0;
  const checks = {
    length12: pwd.length >= 12,
    length16: pwd.length >= 16,
    upper: /[A-Z]/.test(pwd),
    lower: /[a-z]/.test(pwd),
    digits: /\d/.test(pwd),
    symbols: /[^a-zA-Z\d]/.test(pwd),
    noRepeats: !/(.)\1{2,}/.test(pwd),
  };
  score += checks.length12 ? 1 : 0;
  score += checks.length16 ? 1 : 0;
  score += checks.upper ? 1 : 0;
  score += checks.lower ? 1 : 0;
  score += checks.digits ? 1 : 0;
  score += checks.symbols ? 1 : 0;
  score += checks.noRepeats ? 1 : 0;
  const level = score >= 6 ? 'strong' : score >= 4 ? 'moderate' : 'weak';
  return { score, level, checks };
}

export default {
  name: 'password',
  async run({ action = 'generate', length = 20, count = 1, charset = 'all', words = 4, password }) {
    switch (action) {
      case 'generate': {
        const n = Math.min(count, 10);
        const passwords = Array.from({ length: n }, () => genPassword(length, charset));
        return { ok: true, passwords, strength: passwords.map(p => checkStrength(p).level) };
      }
      case 'passphrase': {
        const w = Math.min(words, 8);
        const passphrase = Array.from({ length: w }, () => WORDS[randomInt(WORDS.length)]).join('-');
        return { ok: true, passphrase, entropy: Math.log2(Math.pow(WORDS.length, w)).toFixed(1) + ' bits' };
      }
      case 'pin': {
        const pin = Array.from({ length }, () => randomInt(10)).join('');
        return { ok: true, pin };
      }
      case 'strength': {
        if (!password) return { ok: false, error: 'password required' };
        return { ok: true, ...checkStrength(password) };
      }
      default: return { ok: false, error: `Unknown action: ${action}` };
    }
  },
};
