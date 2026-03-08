/**
 * Web UI Route
 * Serves the OpenBot browser dashboard and all static UI assets.
 */

import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(__dirname, '../../ui');

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

const router = Router();

// Serve any file in the ui/ directory by exact name
router.get('/:file', (req, res, next) => {
  const file = req.params.file;
  // Block path traversal
  if (file.includes('..') || file.includes('/')) return next();
  const filePath = join(UI_DIR, file);
  if (!existsSync(filePath)) return next();
  const mime = MIME[extname(file)] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(readFileSync(filePath));
});

// Serve index.html at /
router.get('/', (req, res) => {
  const html = readFileSync(join(UI_DIR, 'index.html'), 'utf-8');
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(html);
});

export default router;
