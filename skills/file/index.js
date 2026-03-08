/**
 * File Skill
 * Read, write, list, and manage local files.
 */

import {
  readFileSync, writeFileSync, appendFileSync,
  readdirSync, existsSync, unlinkSync, mkdirSync, statSync
} from 'fs';
import { join, resolve, basename } from 'path';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';

function safePath(inputPath) {
  // Resolve ~ to home directory
  const expanded = inputPath.replace(/^~/, HOME);
  return resolve(expanded);
}

export default async function execute({ action, path: inputPath, content, encoding = 'utf-8' }) {
  if (!inputPath) throw new Error('path is required');
  const filePath = safePath(inputPath);

  switch (action) {
    case 'read': {
      if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
      const stat = statSync(filePath);
      if (stat.size > 1024 * 1024) throw new Error('File too large (>1MB). Use shell skill with head/tail instead.');
      return readFileSync(filePath, encoding);
    }

    case 'write': {
      if (content === undefined) throw new Error('content is required for write');
      mkdirSync(join(filePath, '..'), { recursive: true });
      writeFileSync(filePath, content, encoding);
      return `✅ Written ${content.length} chars to ${filePath}`;
    }

    case 'append': {
      if (content === undefined) throw new Error('content is required for append');
      appendFileSync(filePath, content, encoding);
      return `✅ Appended ${content.length} chars to ${filePath}`;
    }

    case 'list': {
      if (!existsSync(filePath)) throw new Error(`Directory not found: ${filePath}`);
      const entries = readdirSync(filePath, { withFileTypes: true });
      const lines = entries.map(e => {
        const indicator = e.isDirectory() ? '📁' : '📄';
        return `${indicator} ${e.name}`;
      });
      return `Contents of ${filePath}:\n${lines.join('\n')}`;
    }

    case 'exists': {
      return existsSync(filePath) ? `✅ Exists: ${filePath}` : `❌ Not found: ${filePath}`;
    }

    case 'delete': {
      if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
      unlinkSync(filePath);
      return `🗑️ Deleted: ${filePath}`;
    }

    case 'mkdir': {
      mkdirSync(filePath, { recursive: true });
      return `📁 Directory created: ${filePath}`;
    }

    default:
      throw new Error(`Unknown action: ${action}. Use: read, write, append, list, exists, delete, mkdir`);
  }
}
