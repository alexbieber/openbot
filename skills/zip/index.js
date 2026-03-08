/**
 * Zip Skill
 * Create and extract zip archives.
 */
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { execSync } from 'child_process';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';

export default async function execute({ action, source, output, exclude = [] }) {
  if (!existsSync(source) && action !== 'list' && action !== 'extract') {
    // For create, source might be new path — check parent
  }

  switch (action) {
    case 'create': return createZip(source, output, exclude);
    case 'extract': return extractZip(source, output);
    case 'list': return listZip(source);
    default: throw new Error(`Unknown action: ${action}`);
  }
}

async function createZip(source, outputPath, exclude) {
  if (!existsSync(source)) throw new Error(`Source not found: ${source}`);
  const zipPath = outputPath || join(dirname(source), `${basename(source)}-${Date.now()}.zip`);

  const { default: archiver } = await import('archiver');
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(`✅ Created: ${zipPath} (${(archive.pointer() / 1024).toFixed(1)} KB)`));
    archive.on('error', reject);
    archive.pipe(output);

    const stat = require('fs').statSync(source);
    if (stat.isDirectory()) {
      archive.glob('**/*', {
        cwd: source,
        ignore: [...exclude, 'node_modules/**', '.git/**'],
      });
    } else {
      archive.file(source, { name: basename(source) });
    }
    archive.finalize();
  });
}

async function extractZip(zipPath, outputDir) {
  if (!existsSync(zipPath)) throw new Error(`Zip not found: ${zipPath}`);
  const dest = outputDir || join(dirname(zipPath), basename(zipPath, '.zip'));
  mkdirSync(dest, { recursive: true });

  const { default: unzipper } = await import('unzipper');
  const { createReadStream } = await import('fs');

  return new Promise((resolve, reject) => {
    createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: dest }))
      .on('close', () => resolve(`✅ Extracted to: ${dest}`))
      .on('error', reject);
  });
}

async function listZip(zipPath) {
  if (!existsSync(zipPath)) throw new Error(`Zip not found: ${zipPath}`);
  const { default: unzipper } = await import('unzipper');
  const { createReadStream } = await import('fs');

  const entries = [];
  return new Promise((resolve, reject) => {
    createReadStream(zipPath)
      .pipe(unzipper.Parse())
      .on('entry', entry => {
        entries.push(`${entry.type === 'Directory' ? '📁' : '📄'} ${entry.path}`);
        entry.autodrain();
      })
      .on('finish', () => resolve(`Contents of ${basename(zipPath)} (${entries.length} items):\n${entries.join('\n')}`))
      .on('error', reject);
  });
}
