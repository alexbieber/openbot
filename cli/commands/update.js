/**
 * CLI: openbot update
 *
 * openbot update              — update to latest stable
 * openbot update --channel beta — update to latest beta
 */

import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));

export function registerUpdateCommand(program) {
  program.command('update')
    .description('Update OpenBot to the latest version')
    .option('--channel <name>', 'Release channel: stable, beta, dev', 'stable')
    .option('--check', 'Check for updates without installing')
    .action(async (opts) => {
      const spin = ora('Checking for updates...').start();
      try {
        const tagMap = { stable: 'latest', beta: 'beta', dev: 'next' };
        const tag = tagMap[opts.channel] || 'latest';
        const npmLatest = execSync(`npm view openbot dist-tags.${tag} 2>/dev/null || echo "unknown"`, { timeout: 10000 }).toString().trim();
        const current = PKG.version;
        spin.stop();

        if (opts.check) {
          console.log(`Current: ${chalk.yellow(current)}`);
          console.log(`Latest (${opts.channel}): ${chalk.green(npmLatest)}`);
          if (npmLatest !== current && npmLatest !== 'unknown') {
            console.log(chalk.yellow(`\nUpdate available! Run: openbot update`));
          } else {
            console.log(chalk.green('\nYou are up to date.'));
          }
          return;
        }

        console.log(`Current version: ${chalk.yellow(current)}`);
        console.log(`Target (${opts.channel}): ${chalk.green(npmLatest)}`);
        console.log('');

        const installSpin = ora('Updating...').start();
        try {
          execSync(`npm install -g openbot@${tag}`, { stdio: 'pipe', timeout: 120000 });
          installSpin.succeed(chalk.green(`Updated to ${npmLatest}`));
          console.log(chalk.dim('Restart the daemon: openbot daemon restart'));
        } catch (err) {
          installSpin.fail(chalk.red('Update failed: ' + err.message));
          console.log(chalk.dim(`Try manually: npm install -g openbot@${tag}`));
        }
      } catch (err) {
        spin.fail(chalk.red('Could not check for updates: ' + err.message));
      }
    });
}
