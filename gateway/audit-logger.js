/**
 * Audit Logger
 * Logs every message, skill execution, and event to a local file.
 */

import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export class AuditLogger {
  constructor(logsDir) {
    this.logsDir = logsDir;
    mkdirSync(logsDir, { recursive: true });
  }

  log(entry) {
    const logEntry = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
    const date = new Date().toISOString().split('T')[0];
    const logFile = join(this.logsDir, `${date}.jsonl`);
    try { appendFileSync(logFile, logEntry); } catch {}
  }
}
