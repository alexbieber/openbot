/**
 * Reminders Skill
 * Schedule text reminders using Node.js setTimeout + persistence.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const REMINDERS_FILE = join(HOME, '.openbot', 'reminders.json');
const timers = new Map();

function load() {
  if (!existsSync(REMINDERS_FILE)) return [];
  try { return JSON.parse(readFileSync(REMINDERS_FILE, 'utf-8')); } catch { return []; }
}

function save(reminders) {
  writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

function parseTime(timeStr) {
  const now = Date.now();
  const s = timeStr.toLowerCase().trim();

  // "in X minutes/hours/seconds"
  const inMatch = s.match(/in\s+(\d+)\s*(second|minute|hour|day)/);
  if (inMatch) {
    const n = parseInt(inMatch[1]);
    const unit = inMatch[2];
    const ms = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 }[unit] * n;
    return now + ms;
  }

  // Try native Date parse
  const d = new Date(timeStr);
  if (!isNaN(d.getTime()) && d.getTime() > now) return d.getTime();

  // "at HH:MM" or "at H:MMpm"
  const atMatch = s.match(/at\s+(\d{1,2}):(\d{2})\s*(am|pm)?/);
  if (atMatch) {
    let h = parseInt(atMatch[1]);
    const m = parseInt(atMatch[2]);
    const ampm = atMatch[3];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target.getTime() <= now) target.setDate(target.getDate() + 1);
    return target.getTime();
  }

  throw new Error(`Cannot parse time: "${timeStr}". Try "in 10 minutes", "at 3:30pm", or an ISO date.`);
}

function scheduleReminder(reminder, userId) {
  const delay = reminder.fireAt - Date.now();
  if (delay <= 0) return;

  const timer = setTimeout(() => {
    timers.delete(reminder.id);
    const reminders = load().filter(r => r.id !== reminder.id);
    save(reminders);

    // Post to gateway
    try {
      const { default: axios } = require('axios');
      axios.post('http://127.0.0.1:18789/message', {
        message: `⏰ Reminder: ${reminder.message}`,
        userId: reminder.userId || 'reminder',
        channel: 'reminder',
      }).catch(() => {});
    } catch {}

    console.log(`[Reminders] Fired: "${reminder.message}"`);
  }, delay);

  timers.set(reminder.id, timer);
}

// On module load, reschedule pending reminders
const existing = load().filter(r => r.fireAt > Date.now());
existing.forEach(r => scheduleReminder(r));

export default async function execute({ action, message, time, id }, context = {}) {
  switch (action) {
    case 'set': {
      if (!message || !time) throw new Error('message and time required');
      const fireAt = parseTime(time);
      const reminder = { id: uuidv4(), message, fireAt, userId: context.userId, created: new Date().toISOString() };
      const reminders = load();
      reminders.push(reminder);
      save(reminders);
      scheduleReminder(reminder, context.userId);
      const when = new Date(fireAt).toLocaleString();
      return `⏰ Reminder set for ${when}: "${message}"`;
    }

    case 'list': {
      const reminders = load().filter(r => r.fireAt > Date.now()).sort((a, b) => a.fireAt - b.fireAt);
      if (!reminders.length) return 'No pending reminders.';
      return `Pending reminders (${reminders.length}):\n` + reminders.map((r, i) =>
        `${i + 1}. [${r.id.slice(0, 8)}] "${r.message}" — ${new Date(r.fireAt).toLocaleString()}`
      ).join('\n');
    }

    case 'delete': {
      if (!id) throw new Error('id required');
      const reminders = load();
      const idx = reminders.findIndex(r => r.id === id || r.id.startsWith(id));
      if (idx === -1) throw new Error(`Reminder not found: ${id}`);
      const removed = reminders.splice(idx, 1)[0];
      save(reminders);
      const timer = timers.get(removed.id);
      if (timer) { clearTimeout(timer); timers.delete(removed.id); }
      return `✅ Deleted reminder: "${removed.message}"`;
    }

    case 'clear': {
      const reminders = load();
      timers.forEach(t => clearTimeout(t));
      timers.clear();
      save([]);
      return `✅ Cleared ${reminders.length} reminder(s)`;
    }

    default: throw new Error(`Unknown action: ${action}`);
  }
}
