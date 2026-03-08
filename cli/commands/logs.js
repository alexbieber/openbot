/**
 * CLI: openbot logs
 *
 * openbot logs           — show last 50 lines
 * openbot logs --follow  — tail the log file
 * openbot logs --lines N — show last N lines
 */

import { readFileSync, existsSync, watchFile } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const LOGS_DIR = join(HOME, '.openbot', 'logs');

export function registerLogsCommand(program) {
  program.command('logs')
    .description('View gateway logs')
    .option('-f, --follow', 'Follow log output (tail -f)')
    .option('-n, --lines <n>', 'Number of lines to show', '50')
    .option('--errors', 'Show only error lines')
    .action((opts) => {
      const logFile = join(LOGS_DIR, 'gateway.log');
      const auditFile = join(LOGS_DIR, 'audit.log');
      const n = parseInt(opts.lines) || 50;

      if (!existsSync(logFile) && !existsSync(auditFile)) {
        console.log(chalk.dim(`No logs found at ${LOGS_DIR}`));
        console.log(chalk.dim('Start the gateway first: openbot gateway start'));
        return;
      }

      function readLines(file, count) {
        if (!existsSync(file)) return [];
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        return lines.slice(-count);
      }

      function printLine(line) {
        if (opts.errors && !line.toLowerCase().includes('error') && !line.toLowerCase().includes('warn')) return;
        if (line.includes('ERROR') || line.includes('error')) {
          console.log(chalk.red(line));
        } else if (line.includes('WARN') || line.includes('warn')) {
          console.log(chalk.yellow(line));
        } else if (line.includes('[Gateway]') || line.includes('[Skills]') || line.includes('[Agents]')) {
          console.log(chalk.cyan(line));
        } else {
          console.log(chalk.dim(line));
        }
      }

      const lines = readLines(logFile, n);
      lines.forEach(printLine);

      if (opts.follow) {
        console.log(chalk.dim('\n--- Following log output (Ctrl+C to stop) ---\n'));
        let lastSize = existsSync(logFile) ? readFileSync(logFile).length : 0;

        const watcher = watchFile(logFile, { interval: 500 }, () => {
          if (!existsSync(logFile)) return;
          const content = readFileSync(logFile, 'utf-8');
          if (content.length <= lastSize) { lastSize = content.length; return; }
          const newContent = content.slice(lastSize);
          lastSize = content.length;
          newContent.split('\n').filter(l => l.trim()).forEach(printLine);
        });

        process.on('SIGINT', () => { process.exit(0); });
      }
    });
}
