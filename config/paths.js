/**
 * Cross-platform path resolver.
 * Works on Windows, macOS, and Linux.
 */

import { join } from 'path';
import { mkdirSync } from 'fs';

export function getHomeDir() {
  return (
    process.env.HOME ||
    process.env.USERPROFILE ||
    (process.env.HOMEDRIVE && process.env.HOMEPATH
      ? join(process.env.HOMEDRIVE, process.env.HOMEPATH)
      : null) ||
    '/tmp'
  );
}

export function getDataDir() {
  return join(getHomeDir(), '.openbot');
}

export function ensureDataDirs() {
  const base = getDataDir();
  for (const sub of ['memory', 'conversations', 'logs', 'skills', 'tokens']) {
    mkdirSync(join(base, sub), { recursive: true });
  }
  return base;
}
