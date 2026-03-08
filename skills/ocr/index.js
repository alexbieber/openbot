import { execSync } from 'child_process';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

export default {
  name: 'ocr',
  async run({ imagePath, language = 'eng', outputFormat = 'text' }) {
    if (!imagePath) return { ok: false, error: 'imagePath required' };
    if (!existsSync(imagePath)) return { ok: false, error: `File not found: ${imagePath}` };

    // Check tesseract is available
    try { execSync('tesseract --version', { stdio: 'pipe' }); }
    catch { return { ok: false, error: 'Tesseract not installed. Install with: brew install tesseract (macOS) or apt install tesseract-ocr (Linux)' }; }

    const outBase = join(tmpdir(), `ocr-${randomBytes(6).toString('hex')}`);
    try {
      const fmt = outputFormat === 'text' ? '' : outputFormat;
      execSync(`tesseract "${imagePath}" "${outBase}" -l ${language} ${fmt}`, { stdio: 'pipe', timeout: 30000 });
      const { readFileSync } = await import('fs');
      const ext = outputFormat === 'text' ? '.txt' : `.${outputFormat}`;
      const text = readFileSync(outBase + ext, 'utf-8').trim();
      try { unlinkSync(outBase + ext); } catch {}
      return { ok: true, text, language, imagePath, charCount: text.length };
    } catch (err) {
      return { ok: false, error: err.stderr?.toString()?.trim() || err.message };
    }
  },
};
