/**
 * CLI: openbot cron
 * Manage scheduled cron jobs.
 *
 * openbot cron add --name "..." --cron "0 9 * * *" --message "..." [--announce --channel telegram]
 * openbot cron add --name "..." --at "2026-03-10T09:00:00Z" --message "..." --delete-after-run
 * openbot cron add --name "..." --every 30m --message "..."
 * openbot cron list
 * openbot cron run <jobId>
 * openbot cron delete <jobId>
 * openbot cron runs [jobId]
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';

const GW = process.env.OPENBOT_GATEWAY || 'http://127.0.0.1:18789';

async function gw(method, path, data) {
  const res = await axios({ method, url: GW + path, data, timeout: 10000 });
  return res.data;
}

function parseInterval(str) {
  const s = str.toLowerCase();
  const match = s.match(/^(\d+)(s|m|h|d)$/);
  if (!match) throw new Error(`Invalid interval: ${str}. Use format: 30s, 5m, 2h, 1d`);
  const n = parseInt(match[1]);
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
  return n * unit;
}

function fmtDate(iso) {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString();
}

function fmtSchedule(schedule) {
  if (!schedule) return 'unknown';
  if (schedule.kind === 'at') return `once at ${fmtDate(schedule.at)}`;
  if (schedule.kind === 'every') return `every ${schedule.ms / 1000}s`;
  if (schedule.kind === 'cron') return schedule.expression + (schedule.tz ? ` (${schedule.tz})` : '');
  return JSON.stringify(schedule);
}

export function registerCronCommands(program) {
  const cronCmd = program.command('cron').description('Manage scheduled cron jobs');

  // cron list
  cronCmd.command('list')
    .description('List all cron jobs')
    .action(async () => {
      const spin = ora('Fetching jobs...').start();
      try {
        const jobs = await gw('get', '/cron');
        spin.stop();
        if (!jobs.length) { console.log(chalk.dim('No cron jobs.')); return; }
        console.log(chalk.bold(`\nCron Jobs (${jobs.length}):\n`));
        jobs.forEach(j => {
          const status = j.enabled ? chalk.green('✓') : chalk.red('✗');
          console.log(`${status} ${chalk.bold(j.name)} ${chalk.dim(`[${j.jobId.slice(0,8)}]`)}`);
          console.log(`   Schedule: ${fmtSchedule(j.schedule)}`);
          console.log(`   Last run: ${fmtDate(j.lastRun)}  |  Next: ${j.nextRun ? fmtDate(j.nextRun) : 'calculated on trigger'}`);
          console.log(`   Payload: ${j.payload?.kind} — ${j.payload?.message || j.payload?.systemEvent || ''}`);
          console.log('');
        });
      } catch (err) {
        spin.fail(chalk.red(err.message));
      }
    });

  // cron add
  cronCmd.command('add')
    .description('Add a new cron job')
    .requiredOption('--name <name>', 'Job name')
    .option('--cron <expression>', 'Cron expression (e.g. "0 9 * * *")')
    .option('--at <datetime>', 'One-shot ISO timestamp (e.g. "2026-03-10T09:00:00Z")')
    .option('--every <interval>', 'Repeating interval (e.g. 30m, 2h, 1d)')
    .option('--tz <timezone>', 'IANA timezone (e.g. America/New_York)')
    .option('--message <text>', 'Message to send to the agent')
    .option('--system-event <text>', 'System event (main session mode)')
    .option('--session <type>', 'Session type: main or isolated (default: isolated)', 'isolated')
    .option('--agent <id>', 'Agent ID (default: default)')
    .option('--announce', 'Post job output to a channel')
    .option('--channel <name>', 'Channel for delivery (e.g. telegram, discord, slack)')
    .option('--to <target>', 'Delivery target (user ID or channel ID)')
    .option('--webhook-url <url>', 'Webhook URL for delivery')
    .option('--delete-after-run', 'Delete job after successful run')
    .action(async (opts) => {
      const spin = ora('Creating cron job...').start();
      try {
        let schedule;
        if (opts.cron) {
          schedule = { kind: 'cron', expression: opts.cron, tz: opts.tz };
        } else if (opts.at) {
          schedule = { kind: 'at', at: new Date(opts.at).toISOString() };
        } else if (opts.every) {
          schedule = { kind: 'every', ms: parseInterval(opts.every) };
        } else {
          throw new Error('Specify --cron, --at, or --every');
        }

        const isMain = opts.session === 'main';
        const payload = isMain
          ? { kind: 'systemEvent', systemEvent: opts.systemEvent || opts.message || '' }
          : { kind: 'agentTurn', message: opts.message || opts.systemEvent || '' };

        let delivery = { mode: 'none' };
        if (opts.announce) {
          delivery = { mode: 'announce', channel: opts.channel, to: opts.to };
        } else if (opts.webhookUrl) {
          delivery = { mode: 'webhook', url: opts.webhookUrl };
        }

        const job = await gw('post', '/cron', {
          name: opts.name,
          schedule,
          payload,
          delivery,
          agentId: opts.agent || 'default',
          deleteAfterRun: opts.deleteAfterRun ?? (schedule.kind === 'at'),
        });

        spin.succeed(chalk.green(`Created: "${job.name}" [${job.jobId.slice(0,8)}]`));
        console.log(`   Schedule: ${fmtSchedule(job.schedule)}`);
        if (job.nextRun) console.log(`   Next run: ${fmtDate(job.nextRun)}`);
      } catch (err) {
        spin.fail(chalk.red(err.message));
      }
    });

  // cron run <jobId>
  cronCmd.command('run <jobId>')
    .description('Run a cron job immediately')
    .action(async (jobId) => {
      const spin = ora('Running job...').start();
      try {
        const result = await gw('post', `/cron/${jobId}/run`, {});
        spin.succeed(chalk.green(`Job ran: "${result.name}"`));
      } catch (err) {
        spin.fail(chalk.red(err.message));
      }
    });

  // cron delete <jobId>
  cronCmd.command('delete <jobId>')
    .description('Delete a cron job')
    .action(async (jobId) => {
      const spin = ora('Deleting...').start();
      try {
        const result = await gw('delete', `/cron/${jobId}`, {});
        spin.succeed(chalk.green(`Deleted: "${result.name}"`));
      } catch (err) {
        spin.fail(chalk.red(err.message));
      }
    });

  // cron runs [jobId]
  cronCmd.command('runs [jobId]')
    .description('Show recent run history')
    .action(async (jobId) => {
      const spin = ora('Fetching runs...').start();
      try {
        const runs = await gw('get', jobId ? `/cron/${jobId}/runs` : '/cron/runs', {});
        spin.stop();
        if (!runs.length) { console.log(chalk.dim('No runs.')); return; }
        console.log(chalk.bold(`\nRecent runs (${runs.length}):\n`));
        runs.slice(-20).forEach(r => {
          const icon = r.status === 'ok' ? chalk.green('✓') : chalk.red('✗');
          console.log(`${icon} ${r.name} — ${fmtDate(r.startedAt)} (${r.status})`);
          if (r.error) console.log(`   Error: ${r.error}`);
        });
      } catch (err) {
        spin.fail(chalk.red(err.message));
      }
    });
}
