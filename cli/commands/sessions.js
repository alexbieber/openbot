/**
 * CLI: openbot sessions
 *
 * openbot sessions list   — list all sessions
 * openbot sessions clear  — clear all sessions
 * openbot sessions show <id> — show session messages
 */

import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';

const GW = process.env.OPENBOT_GATEWAY || 'http://127.0.0.1:18789';

export function registerSessionsCommands(program) {
  const cmd = program.command('sessions').description('Manage conversation sessions');

  cmd.command('list')
    .description('List all sessions')
    .action(async () => {
      const spin = ora('Loading sessions...').start();
      try {
        const res = await axios.get(`${GW}/conversations`, { timeout: 5000 });
        spin.stop();
        const sessions = res.data;
        if (!sessions.length) { console.log(chalk.dim('No sessions.')); return; }
        console.log(chalk.bold(`\nSessions (${sessions.length}):\n`));
        sessions.forEach(s => {
          console.log(`  ${chalk.dim(s.sessionId.slice(0,8))}  @${s.agentId}  user: ${s.userId}`);
        });
        console.log('');
      } catch (err) {
        spin.fail(chalk.red(err.message));
      }
    });

  cmd.command('show <sessionId>')
    .description('Show messages in a session')
    .action(async (sessionId) => {
      const spin = ora('Loading...').start();
      try {
        const res = await axios.get(`${GW}/conversations/${sessionId}`, { timeout: 5000 });
        spin.stop();
        const { messages } = res.data;
        if (!messages?.length) { console.log(chalk.dim('No messages.')); return; }
        messages.forEach(m => {
          const role = m.role === 'user' ? chalk.cyan('You:') : chalk.green('Bot:');
          const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          console.log(`\n${role} ${content.substring(0, 300)}${content.length > 300 ? '...' : ''}`);
        });
        console.log('');
      } catch (err) {
        spin.fail(chalk.red(err.message));
      }
    });

  cmd.command('clear')
    .description('Clear all session history')
    .option('--confirm', 'Skip confirmation prompt')
    .action(async (opts) => {
      if (!opts.confirm) {
        const { createInterface } = await import('readline');
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        await new Promise(res => {
          rl.question(chalk.yellow('This will delete ALL session history. Continue? [y/N] '), ans => {
            rl.close();
            if (ans.toLowerCase() !== 'y') { console.log('Aborted.'); process.exit(0); }
            res();
          });
        });
      }
      const spin = ora('Clearing sessions...').start();
      try {
        await axios.delete(`${GW}/conversations`, { timeout: 5000 });
        spin.succeed(chalk.green('All sessions cleared.'));
      } catch {
        spin.fail(chalk.red('Gateway offline — delete ~/.openbot/conversations/*.json manually'));
      }
    });
}
