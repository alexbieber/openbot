/**
 * openbot agents — manage multiple agents
 * Commands: list, add, show
 * Mirrors ClawdBot's `openclaw agents` command
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const DATA_DIR = join(HOME, '.openbot');
const CONFIG_PATH = join(DATA_DIR, 'config.json');

function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function cyan(s) { return `\x1b[36m${s}\x1b[0m`; }
function dim(s) { return `\x1b[2m${s}\x1b[0m`; }

function loadConfig() {
  try { return existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) : {}; }
  catch { return {}; }
}
function saveConfig(cfg) { writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); }

export async function agents(subcommand = 'list', opts = {}) {
  const cfg = loadConfig();
  const agentList = cfg.agents?.list || [{ id: 'default', name: 'Default Agent', default: true }];

  switch (subcommand) {
    case 'list': {
      console.log(`\n${bold('Agents')}  (${agentList.length} configured)\n`);
      for (const a of agentList) {
        const marker = a.default ? green('* ') : '  ';
        console.log(`${marker}${bold(a.id)}  ${dim(a.name || '')}  ${a.model ? cyan(a.model) : ''}`);
        if (opts.bindings && cfg.bindings) {
          const bound = (cfg.bindings || []).filter(b => b.agentId === a.id);
          for (const b of bound) {
            const m = b.match;
            console.log(`    ${dim('↳')} ${m.channel || '*'} ${m.accountId ? `account:${m.accountId}` : ''} ${m.peer ? `peer:${m.peer.id}` : ''}`);
          }
        }
      }
      console.log();
      break;
    }

    case 'add': {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q, def = '') => new Promise(r => rl.question(q, ans => r(ans.trim() || def)));

      const id = opts.id || await ask('Agent ID (e.g. work, personal): ');
      if (!id) { rl.close(); return; }
      if (agentList.find(a => a.id === id)) { console.log(`\x1b[33m! Agent '${id}' already exists\x1b[0m`); rl.close(); return; }

      const name = await ask(`Display name [${id}]: `, id);
      const model = await ask('Model override (leave blank for default): ');
      const workspace = join(DATA_DIR, `workspace-${id}`);

      mkdirSync(workspace, { recursive: true });
      // Create workspace files
      writeFileSync(join(workspace, 'SOUL.md'), `# ${name}\n\nYou are ${name}, a helpful AI assistant.\n`);
      writeFileSync(join(workspace, 'IDENTITY.md'), `# IDENTITY\n\n## Name\n${name}\n`);

      const newAgent = { id, name, workspace, ...(model ? { model } : {}) };
      cfg.agents = cfg.agents || {};
      cfg.agents.list = [...agentList, newAgent];
      saveConfig(cfg);
      rl.close();
      console.log(green(`\n✓ Agent '${id}' created`));
      console.log(dim(`  Workspace: ${workspace}`));
      console.log(dim(`  Add channel bindings to route messages to this agent.`));
      break;
    }

    case 'show': {
      const id = opts.id || opts._[0];
      const agent = agentList.find(a => a.id === id);
      if (!agent) { console.error(`Agent '${id}' not found`); process.exit(1); }
      console.log(JSON.stringify(agent, null, 2));
      break;
    }

    case 'remove':
    case 'delete': {
      const id = opts.id || opts._[0];
      if (!id) { console.error('Agent ID required'); return; }
      cfg.agents.list = agentList.filter(a => a.id !== id);
      saveConfig(cfg);
      console.log(green(`✓ Agent '${id}' removed`));
      break;
    }

    default:
      console.log('Usage: openbot agents <list|add|show|remove>');
  }
}
