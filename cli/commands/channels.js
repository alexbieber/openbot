/**
 * CLI: openbot channels
 *
 * openbot channels status          — show all channel statuses
 * openbot channels status --probe  — probe channels and test connections
 * openbot channels list            — list configured channels
 */

import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';

const GW = process.env.OPENBOT_GATEWAY || 'http://127.0.0.1:18789';

const CHANNELS = [
  { id: 'telegram',    envKey: 'TELEGRAM_BOT_TOKEN',    port: null,  desc: 'Telegram Bot' },
  { id: 'discord',     envKey: 'DISCORD_BOT_TOKEN',     port: null,  desc: 'Discord Bot' },
  { id: 'slack',       envKey: 'SLACK_BOT_TOKEN',       port: 8090,  desc: 'Slack Bolt' },
  { id: 'whatsapp',    envKey: null,                    port: 8091,  desc: 'WhatsApp (QR login)' },
  { id: 'signal',      envKey: 'SIGNAL_NUMBER',         port: 8092,  desc: 'Signal (signal-cli)' },
  { id: 'imessage',    envKey: 'BLUEBUBBLES_URL',       port: 8093,  desc: 'iMessage (BlueBubbles)' },
  { id: 'matrix',      envKey: 'MATRIX_HOMESERVER',     port: 8094,  desc: 'Matrix' },
  { id: 'teams',       envKey: 'TEAMS_APP_ID',          port: 8095,  desc: 'Microsoft Teams' },
  { id: 'googlechat',  envKey: 'GOOGLE_CHAT_TOKEN',     port: 8096,  desc: 'Google Chat' },
  { id: 'line',        envKey: 'LINE_CHANNEL_ACCESS_TOKEN', port: 8097, desc: 'LINE' },
  { id: 'mattermost',  envKey: 'MATTERMOST_URL',        port: null,  desc: 'Mattermost' },
  { id: 'irc',         envKey: 'IRC_SERVER',            port: null,  desc: 'IRC' },
  { id: 'feishu',      envKey: 'FEISHU_APP_ID',         port: null,  desc: 'Feishu (Lark)' },
  { id: 'zalo',        envKey: 'ZALO_APP_ID',           port: null,  desc: 'Zalo' },
  { id: 'nostr',       envKey: 'NOSTR_PRIVATE_KEY',     port: null,  desc: 'Nostr' },
  { id: 'web',         envKey: null,                    port: 18789, desc: 'Web UI (built-in)' },
];

export function registerChannelsCommands(program) {
  const cmd = program.command('channels').description('Manage messaging channels');

  cmd.command('status')
    .description('Show channel statuses')
    .option('--probe', 'Test connections to each channel adapter')
    .action(async (opts) => {
      console.log(chalk.bold('\nChannel Status:\n'));

      for (const ch of CHANNELS) {
        const hasKey = !ch.envKey || !!process.env[ch.envKey];
        let portStatus = null;

        if (opts.probe && ch.port) {
          try {
            await axios.get(`http://127.0.0.1:${ch.port}/health`, { timeout: 1500 });
            portStatus = 'online';
          } catch {
            portStatus = 'offline';
          }
        }

        const keyIcon = hasKey ? chalk.green('✓') : chalk.dim('✗');
        const portIcon = portStatus === 'online' ? chalk.green('●') :
                         portStatus === 'offline' ? chalk.red('●') : chalk.dim('○');

        let line = `${keyIcon} ${chalk.white(ch.id.padEnd(14))} ${chalk.dim(ch.desc)}`;
        if (opts.probe && ch.port) {
          line += ` ${portIcon} port ${ch.port}`;
        }
        if (!hasKey && ch.envKey) {
          line += chalk.dim(` — set ${ch.envKey}`);
        }
        console.log('  ' + line);
      }
      console.log('');
    });

  cmd.command('list')
    .description('List configured channels')
    .action(() => {
      const configured = CHANNELS.filter(ch => !ch.envKey || !!process.env[ch.envKey]);
      if (!configured.length) {
        console.log(chalk.yellow('\nNo channels configured. Add API keys to .env\n'));
        return;
      }
      console.log(chalk.bold(`\nConfigured Channels (${configured.length}):\n`));
      configured.forEach(ch => console.log(`  ✓ ${ch.id} — ${ch.desc}`));
      console.log('');
    });
}
