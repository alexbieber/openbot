/**
 * Shell Skill
 * Executes shell commands in a sandboxed, timeout-protected environment.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

// Commands that always require explicit confirmation (handled by gateway security layer)
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+[~/]/,
  /sudo\s+rm/,
  />\s*\/dev\/(sd|hd|nvme)/,
  /mkfs/,
  /dd\s+if=/,
  /chmod\s+777\s+\//,
];

export default async function execute({ command, workingDir, timeout = 30000 }, context = {}) {
  if (!command) throw new Error('command is required');

  // Safety check
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Blocked: Command matches dangerous pattern. Explicit confirmation required.`);
    }
  }

  const cwd = workingDir || process.env.HOME || process.env.USERPROFILE || '/tmp';

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024, // 1MB output limit
      env: { ...process.env, TERM: 'dumb' },
    });

    const result = [];
    if (stdout.trim()) result.push(`STDOUT:\n${stdout.trim()}`);
    if (stderr.trim()) result.push(`STDERR:\n${stderr.trim()}`);

    return result.join('\n') || '(command completed with no output)';
  } catch (err) {
    if (err.killed) throw new Error(`Command timed out after ${timeout}ms`);
    const msg = err.stderr?.trim() || err.message;
    throw new Error(`Command failed (exit ${err.code}): ${msg}`);
  }
}
