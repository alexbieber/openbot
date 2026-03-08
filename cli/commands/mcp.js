/**
 * MCP CLI — manage Model Context Protocol server connections
 *
 * Commands:
 *   openbot mcp list          — list connected MCP servers + tools
 *   openbot mcp tools         — list all available MCP tools
 *   openbot mcp connect       — connect to a new MCP server
 *   openbot mcp disconnect    — disconnect an MCP server
 *   openbot mcp call          — call an MCP tool directly
 *   openbot mcp install       — add an MCP server to openbot.json
 *   openbot mcp popular       — show popular MCP servers
 */

import chalk from 'chalk';
import { loadOpenBotConfig, writeOpenBotConfig } from '../config/openbot-config.js';

const POPULAR_SERVERS = [
  { name: 'filesystem', package: '@modelcontextprotocol/server-filesystem', desc: 'Read/write local files', env: [] },
  { name: 'github', package: '@modelcontextprotocol/server-github', desc: 'GitHub repos, issues, PRs', env: ['GITHUB_TOKEN'] },
  { name: 'gitlab', package: '@modelcontextprotocol/server-gitlab', desc: 'GitLab projects, MRs', env: ['GITLAB_TOKEN'] },
  { name: 'brave-search', package: '@modelcontextprotocol/server-brave-search', desc: 'Web search via Brave', env: ['BRAVE_API_KEY'] },
  { name: 'postgres', package: '@modelcontextprotocol/server-postgres', desc: 'Query PostgreSQL databases', env: ['POSTGRES_URL'] },
  { name: 'sqlite', package: '@modelcontextprotocol/server-sqlite', desc: 'Query SQLite files', env: [] },
  { name: 'memory', package: '@modelcontextprotocol/server-memory', desc: 'Persistent agent memory (KV store)', env: [] },
  { name: 'puppeteer', package: '@modelcontextprotocol/server-puppeteer', desc: 'Browser automation', env: [] },
  { name: 'fetch', package: '@modelcontextprotocol/server-fetch', desc: 'HTTP fetch', env: [] },
  { name: 'slack', package: '@modelcontextprotocol/server-slack', desc: 'Slack messages and channels', env: ['SLACK_BOT_TOKEN'] },
  { name: 'google-maps', package: '@modelcontextprotocol/server-google-maps', desc: 'Maps, directions, places', env: ['GOOGLE_MAPS_API_KEY'] },
  { name: 'sequential-thinking', package: '@modelcontextprotocol/server-sequential-thinking', desc: 'Structured reasoning chains', env: [] },
];

export function registerMCPCommands(program) {
  const cmd = program.command('mcp').description('Model Context Protocol (MCP) server management');

  cmd.command('list')
    .description('List connected MCP servers')
    .option('--url <url>', 'Gateway URL', 'http://localhost:3000')
    .action(async (opts) => {
      try {
        const res = await fetch(`${opts.url}/mcp/servers`);
        if (!res.ok) throw new Error(`Gateway error: ${res.status}`);
        const servers = await res.json();
        if (!servers.length) {
          console.log(chalk.yellow('No MCP servers connected.'));
          console.log(chalk.dim('  Run: openbot mcp popular  — to see available servers'));
          return;
        }
        console.log(chalk.bold('\n  MCP Servers\n'));
        for (const s of servers) {
          const icon = s.connected ? chalk.green('●') : chalk.red('○');
          console.log(`  ${icon} ${chalk.bold(s.name)}  ${chalk.dim(`${s.tools} tools, ${s.resources} resources`)}`);
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
      }
    });

  cmd.command('tools')
    .description('List all tools available via MCP')
    .option('--url <url>', 'Gateway URL', 'http://localhost:3000')
    .option('--server <name>', 'Filter by server name')
    .action(async (opts) => {
      try {
        const res = await fetch(`${opts.url}/mcp/tools`);
        if (!res.ok) throw new Error(`Gateway error: ${res.status}`);
        let tools = await res.json();
        if (opts.server) tools = tools.filter(t => t.server === opts.server);
        if (!tools.length) { console.log(chalk.yellow('No MCP tools available.')); return; }
        console.log(chalk.bold(`\n  MCP Tools (${tools.length})\n`));
        for (const t of tools) {
          console.log(`  ${chalk.cyan(t.server + '__' + t.name)}`);
          if (t.description) console.log(`    ${chalk.dim(t.description)}`);
        }
        console.log();
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
      }
    });

  cmd.command('call <tool>')
    .description('Call an MCP tool directly (tool format: server__toolname)')
    .option('--url <url>', 'Gateway URL', 'http://localhost:3000')
    .option('--args <json>', 'Tool arguments as JSON', '{}')
    .action(async (tool, opts) => {
      try {
        const args = JSON.parse(opts.args);
        const res = await fetch(`${opts.url}/mcp/call`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool, args }),
        });
        const result = await res.json();
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
      }
    });

  cmd.command('popular')
    .description('Show popular MCP servers you can install')
    .action(() => {
      console.log(chalk.bold('\n  Popular MCP Servers\n'));
      console.log(chalk.dim('  Run: openbot mcp install <name>  — to add to your openbot.json\n'));
      for (const s of POPULAR_SERVERS) {
        console.log(`  ${chalk.cyan(s.name.padEnd(22))} ${s.desc}`);
        console.log(`    ${chalk.dim('npm install ' + s.package)}`);
        if (s.env.length) console.log(`    ${chalk.yellow('Requires: ' + s.env.join(', '))}`);
      }
      console.log();
    });

  cmd.command('install <name>')
    .description('Add an MCP server to openbot.json')
    .option('--package <pkg>', 'npm package (default: @modelcontextprotocol/server-<name>)')
    .option('--args <json>', 'Additional args JSON array', '[]')
    .option('--env <json>', 'Env vars JSON object', '{}')
    .action(async (name, opts) => {
      const cfg = loadOpenBotConfig();
      if (!cfg.mcp) cfg.mcp = { servers: {} };
      if (!cfg.mcp.servers) cfg.mcp.servers = {};

      const popular = POPULAR_SERVERS.find(s => s.name === name);
      const pkg = opts.package || popular?.package || `@modelcontextprotocol/server-${name}`;
      const extraArgs = JSON.parse(opts.args);
      const envVars = JSON.parse(opts.env);

      cfg.mcp.servers[name] = {
        command: 'npx',
        args: ['-y', pkg, ...extraArgs],
        ...(Object.keys(envVars).length ? { env: envVars } : {}),
      };

      writeOpenBotConfig(cfg);
      console.log(chalk.green(`✓ MCP server "${name}" added to openbot.json`));
      console.log(chalk.dim(`  Restart gateway to connect: node gateway/server.js`));

      if (popular?.env.length) {
        console.log(chalk.yellow(`\n  Don't forget to set: ${popular.env.join(', ')}`));
      }
    });

  cmd.command('remove <name>')
    .description('Remove an MCP server from openbot.json')
    .action((name) => {
      const cfg = loadOpenBotConfig();
      if (cfg.mcp?.servers?.[name]) {
        delete cfg.mcp.servers[name];
        writeOpenBotConfig(cfg);
        console.log(chalk.green(`✓ MCP server "${name}" removed`));
      } else {
        console.log(chalk.yellow(`Server "${name}" not found in config`));
      }
    });
}
