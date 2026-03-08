/**
 * RSS Skill
 * Fetch and subscribe to RSS/Atom feeds.
 */
import axios from 'axios';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const FEEDS_FILE = join(HOME, '.openbot', 'rss-feeds.json');

function loadFeeds() {
  if (!existsSync(FEEDS_FILE)) return {};
  try { return JSON.parse(readFileSync(FEEDS_FILE, 'utf-8')); } catch { return {}; }
}

function saveFeeds(feeds) {
  writeFileSync(FEEDS_FILE, JSON.stringify(feeds, null, 2));
}

function parseRss(xml) {
  const isAtom = xml.includes('<feed');
  const items = [];

  if (isAtom) {
    const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    entries.forEach(entry => {
      const title = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
      const link = entry.match(/href="([^"]+)"/)?.[1] || '';
      const summary = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1]?.replace(/<[^>]+>/g, '').replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
      const date = entry.match(/<updated>([\s\S]*?)<\/updated>/)?.[1] || '';
      items.push({ title, link, summary, date });
    });
  } else {
    const entries = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    entries.forEach(entry => {
      const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
      const link = entry.match(/<link>([\s\S]*?)<\/link>/)?.[1] || entry.match(/<link[^>]+href="([^"]+)"/)?.[1] || '';
      const desc = entry.match(/<description>([\s\S]*?)<\/description>/)?.[1]?.replace(/<[^>]+>/g, '').replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
      const date = entry.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
      items.push({ title, link, summary: desc, date });
    });
  }
  return items;
}

export default async function execute({ action, url, count = 5, name }) {
  switch (action) {
    case 'fetch': {
      if (!url) throw new Error('url required');
      const res = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'OpenBot RSS Reader' },
      });
      const items = parseRss(res.data);
      if (!items.length) return 'No items found in feed.';
      return `Feed items (${Math.min(count, items.length)}):\n\n` +
        items.slice(0, count).map((item, i) =>
          `${i + 1}. **${item.title}**\n   ${item.date ? new Date(item.date).toLocaleDateString() : ''}\n   ${item.summary?.substring(0, 100) || ''}\n   ${item.link}`
        ).join('\n\n');
    }
    case 'subscribe': {
      if (!url || !name) throw new Error('url and name required');
      const feeds = loadFeeds();
      feeds[name] = { url, subscribedAt: new Date().toISOString() };
      saveFeeds(feeds);
      return `✅ Subscribed to "${name}": ${url}`;
    }
    case 'list': {
      const feeds = loadFeeds();
      const keys = Object.keys(feeds);
      if (!keys.length) return 'No subscribed feeds.';
      return `Subscribed feeds (${keys.length}):\n` + keys.map(k => `  • ${k}: ${feeds[k].url}`).join('\n');
    }
    case 'unsubscribe': {
      if (!name) throw new Error('name required');
      const feeds = loadFeeds();
      if (!feeds[name]) throw new Error(`Feed not found: "${name}"`);
      delete feeds[name];
      saveFeeds(feeds);
      return `✅ Unsubscribed from "${name}"`;
    }
    default: throw new Error(`Unknown action: ${action}`);
  }
}
