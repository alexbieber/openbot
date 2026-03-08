/**
 * openbot plugins — manage gateway plugins/hooks
 * Commands: list, install, remove, enable, disable
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import axios from 'axios';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const PLUGINS_DIR = join(HOME, '.openbot', 'plugins');
const PORT = process.env.GATEWAY_PORT || 18789;

export async function plugins(subcommand = 'list', opts = {}) {
  mkdirSync(PLUGINS_DIR, { recursive: true });

  switch (subcommand) {
    case 'list': {
      const files = existsSync(PLUGINS_DIR)
        ? readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'))
        : [];

      // Also get loaded plugins from gateway
      let loaded = [];
      try {
        const res = await axios.get(`http://127.0.0.1:${PORT}/plugins`, { timeout: 3000 });
        loaded = res.data || [];
      } catch {}

      if (!files.length && !loaded.length) { console.log('No plugins installed'); break; }
      console.log(`\nInstalled Plugins (${files.length})\n`);
      files.forEach(f => {
        const active = loaded.find(l => l.name === f.replace('.js', ''));
        const dot = active ? '\x1b[32m●\x1b[0m' : '\x1b[33m○\x1b[0m';
        console.log(`  ${dot} ${f}`);
      });
      break;
    }

    case 'install': {
      const src = opts._?.[0] || opts.path;
      if (!src) { console.error('Plugin file or npm package required'); return; }
      // For now, copy local file to plugins dir
      if (existsSync(src)) {
        const name = src.split(/[\\/]/).pop();
        const dest = join(PLUGINS_DIR, name);
        writeFileSync(dest, readFileSync(src));
        console.log(`\x1b[32m✓ Plugin installed: ${name}\x1b[0m`);
        console.log('  Restart the gateway to load it.');
      } else {
        console.error(`File not found: ${src}`);
      }
      break;
    }

    case 'remove': {
      const name = opts._?.[0];
      if (!name) { console.error('Plugin name required'); return; }
      const file = join(PLUGINS_DIR, name.endsWith('.js') ? name : name + '.js');
      if (existsSync(file)) { unlinkSync(file); console.log(`\x1b[33m✓ Plugin removed: ${name}\x1b[0m`); }
      else console.error(`Plugin not found: ${name}`);
      break;
    }

    default:
      console.log('Usage: openbot plugins <list|install|remove>');
      console.log('\nPlugins are .js files in ~/.openbot/plugins/');
      console.log('They are loaded at gateway startup.');
  }
}
