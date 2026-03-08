/**
 * OpenBot Hub — community skill marketplace (like ClawdBot's ClawHub)
 * 
 * openbot hub search <query>         — search the registry
 * openbot hub install <name>         — install a skill
 * openbot hub list                   — list installed hub skills
 * openbot hub info <name>            — show skill details
 * openbot hub update [name]          — update skill(s)
 * openbot hub remove <name>          — uninstall a skill
 * openbot hub publish                — publish current skill to registry
 * openbot hub featured               — show featured skills
 *
 * Registry: GitHub topics tagged "openbot-skill" + official curated list
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const DATA_DIR = join(HOME, '.openbot');
const HUB_DIR = join(DATA_DIR, 'hub-skills');
const HUB_INDEX = join(DATA_DIR, 'hub-index.json');
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_SKILLS_DIR = join(__dirname, '../../skills');

const REGISTRY_URL = process.env.OPENBOT_REGISTRY || 'https://registry.openbot.ai';
const GITHUB_TOPIC = 'openbot-skill';

const bold = s => `\x1b[1m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const cyan = s => `\x1b[36m${s}\x1b[0m`;
const dim = s => `\x1b[2m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;

// Official curated skills list (bundled in project)
const OFFICIAL_SKILLS = [
  { name: 'browser', description: 'Full Playwright browser automation', author: 'openbot', stars: 0, official: true },
  { name: 'brave-search', description: 'Web search via Brave API', author: 'openbot', stars: 0, official: true },
  { name: 'firecrawl', description: 'Deep website scraping to markdown', author: 'openbot', stars: 0, official: true },
  { name: 'git', description: 'Git operations', author: 'openbot', stars: 0, official: true },
  { name: 'docker', description: 'Docker container management', author: 'openbot', stars: 0, official: true },
  { name: 'voice', description: 'ElevenLabs TTS + Whisper STT', author: 'openbot', stars: 0, official: true },
  { name: 'github', description: 'GitHub API integration', author: 'openbot', stars: 0, official: true },
  { name: 'notion', description: 'Notion API integration', author: 'openbot', stars: 0, official: true },
  { name: 'calendar', description: 'Google Calendar / iCal', author: 'openbot', stars: 0, official: true },
  { name: 'home-assistant', description: 'Home Assistant integration', author: 'openbot', stars: 0, official: true },
];

async function searchGitHub(query) {
  try {
    const q = encodeURIComponent(`topic:${GITHUB_TOPIC} ${query || ''} in:name,description`);
    const res = await fetch(`https://api.github.com/search/repositories?q=${q}&per_page=20&sort=stars`, {
      headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'OpenBot-Hub/1.0' },
    });
    if (!res.ok) return [];
    const { items } = await res.json();
    return (items || []).map(r => ({
      name: r.name.replace(/^openbot-skill-/, ''),
      description: r.description || '',
      author: r.owner.login,
      stars: r.stargazers_count,
      url: r.clone_url,
      official: false,
    }));
  } catch { return []; }
}

function loadHubIndex() {
  if (!existsSync(HUB_INDEX)) return {};
  try { return JSON.parse(readFileSync(HUB_INDEX, 'utf-8')); } catch { return {}; }
}
function saveHubIndex(idx) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(HUB_INDEX, JSON.stringify(idx, null, 2));
}

function isInstalled(name) {
  return existsSync(join(HUB_DIR, name)) || existsSync(join(LOCAL_SKILLS_DIR, name));
}

export function registerHubCommands(program) {
  const cmd = program.command('hub').description('OpenBot Hub — community skill marketplace');
  // Also alias as openbot skills hub
  program.command('market').description('Alias for openbot hub').action(() => { console.log('Use: openbot hub <command>'); });

  cmd.command('search [query]')
    .description('Search community skills')
    .option('--official', 'Show official skills only')
    .action(async (query, opts) => {
      console.log(dim(`Searching${query ? ` for "${query}"` : ' all skills'}...\n`));
      let results = [];
      if (!opts.official) results = await searchGitHub(query || '');
      const official = OFFICIAL_SKILLS.filter(s => !query || s.name.includes(query) || s.description.toLowerCase().includes(query));
      results = [...official, ...results.filter(r => !OFFICIAL_SKILLS.find(o => o.name === r.name))];
      if (!results.length) { console.log(yellow('No skills found.')); return; }
      console.log(`Found ${results.length} skills:\n`);
      for (const s of results) {
        const installed = isInstalled(s.name);
        const tag = s.official ? cyan('[official]') : dim('[community]');
        const inst = installed ? green(' ✓') : '';
        console.log(`  ${bold(s.name)}${inst} ${tag}`);
        console.log(`  ${dim(s.description)}`);
        if (!s.official) console.log(`  ${dim(`by @${s.author} · ⭐ ${s.stars}`)}`);
        console.log();
      }
    });

  cmd.command('featured')
    .description('Show featured / popular community skills')
    .action(async () => {
      console.log(bold('\nFeatured OpenBot Skills\n'));
      const res = await searchGitHub('');
      const featured = [...OFFICIAL_SKILLS, ...res].slice(0, 15);
      for (const s of featured) {
        const installed = isInstalled(s.name);
        console.log(`  ${installed ? green('✓') : ' '} ${bold(s.name.padEnd(24))} ${dim(s.description.slice(0, 50))}`);
      }
      console.log(dim('\n  Install any skill: openbot hub install <name>'));
    });

  cmd.command('info <name>')
    .description('Show skill details')
    .action(async (name) => {
      const official = OFFICIAL_SKILLS.find(s => s.name === name);
      if (official) {
        const skillDir = join(LOCAL_SKILLS_DIR, name);
        const mdPath = join(skillDir, 'SKILL.md');
        if (existsSync(mdPath)) {
          console.log(readFileSync(mdPath, 'utf-8'));
        } else {
          console.log(`${bold(name)} — ${official.description} (official)`);
        }
        return;
      }
      // GitHub lookup
      const results = await searchGitHub(name);
      const found = results.find(r => r.name === name);
      if (!found) { console.log(red(`Skill "${name}" not found in registry.`)); return; }
      console.log(`\n${bold(found.name)}\n${found.description}\nBy: @${found.author} · ⭐ ${found.stars}\nRepo: ${found.url}\n`);
    });

  cmd.command('install <name>')
    .description('Install a skill from the hub')
    .option('--source <url>', 'Install from a specific GitHub URL or local path')
    .action(async (name, opts) => {
      if (isInstalled(name) && !opts.source) {
        console.log(yellow(`"${name}" is already installed.`)); return;
      }

      // Official skills are bundled
      if (OFFICIAL_SKILLS.find(s => s.name === name) && existsSync(join(LOCAL_SKILLS_DIR, name))) {
        console.log(green(`✓ "${name}" is an official skill and already available.`));
        return;
      }

      const results = await searchGitHub(name);
      const found = opts.source ? { url: opts.source, name } : results.find(r => r.name === name);
      if (!found) { console.log(red(`Skill "${name}" not found. Try: openbot hub search ${name}`)); return; }

      mkdirSync(HUB_DIR, { recursive: true });
      const destDir = join(HUB_DIR, name);
      process.stdout.write(`Installing ${bold(name)}...`);

      try {
        if (found.url?.startsWith('http')) {
          execSync(`git clone --depth=1 "${found.url}" "${destDir}"`, { stdio: 'pipe' });
        } else if (existsSync(found.url || '')) {
          execSync(`cp -r "${found.url}" "${destDir}"`, { stdio: 'pipe' });
        }
        const idx = loadHubIndex();
        idx[name] = { name, url: found.url, author: found.author, installedAt: new Date().toISOString() };
        saveHubIndex(idx);
        console.log(green(` done!\n  Location: ${destDir}\n  Reload gateway to use: openbot skills reload`));
      } catch (err) {
        console.log(red(` failed: ${err.message}`));
      }
    });

  cmd.command('remove <name>')
    .description('Uninstall a hub skill')
    .action((name) => {
      const destDir = join(HUB_DIR, name);
      if (!existsSync(destDir)) { console.log(yellow(`"${name}" is not installed via hub.`)); return; }
      rmSync(destDir, { recursive: true, force: true });
      const idx = loadHubIndex();
      delete idx[name];
      saveHubIndex(idx);
      console.log(green(`✓ Removed "${name}"`));
    });

  cmd.command('list')
    .description('List installed hub skills')
    .action(() => {
      const idx = loadHubIndex();
      const entries = Object.values(idx);
      if (!entries.length) { console.log(dim('No hub skills installed. Try: openbot hub featured')); return; }
      console.log(`\n${bold('Installed Hub Skills')}\n`);
      for (const s of entries) {
        console.log(`  ${green('✓')} ${bold(s.name)} ${dim(`by @${s.author || '?'} · installed ${s.installedAt?.slice(0,10)}`)}`);
      }
      console.log();
    });

  cmd.command('update [name]')
    .description('Update installed hub skills')
    .action(async (name) => {
      const idx = loadHubIndex();
      const toUpdate = name ? [idx[name]].filter(Boolean) : Object.values(idx);
      if (!toUpdate.length) { console.log(yellow('No hub skills to update.')); return; }
      for (const s of toUpdate) {
        const destDir = join(HUB_DIR, s.name);
        if (!existsSync(destDir)) continue;
        process.stdout.write(`Updating ${bold(s.name)}...`);
        try {
          execSync('git pull --rebase', { cwd: destDir, stdio: 'pipe' });
          console.log(green(' done!'));
        } catch { console.log(yellow(' skipped (not a git repo)')); }
      }
    });

  cmd.command('publish')
    .description('Publish current skill directory to the hub')
    .option('--dir <path>', 'Skill directory to publish', '.')
    .action((opts) => {
      const skillDir = opts.dir;
      const mdPath = join(skillDir, 'SKILL.md');
      if (!existsSync(mdPath)) { console.log(red('No SKILL.md found. Create one first.')); return; }
      console.log(`\n${bold('Publish to OpenBot Hub')}\n`);
      console.log('To publish your skill to the community:');
      console.log(`  1. Push your skill folder to a public GitHub repo`);
      console.log(`  2. Add the topic ${cyan('openbot-skill')} to your repo`);
      console.log(`  3. Others can install it: ${cyan(`openbot hub install your-skill-name`)}`);
      console.log(`\nFor the official registry, open an issue at:\n  ${cyan('https://github.com/openbot-ai/openbot/issues')}\n`);
    });
}
