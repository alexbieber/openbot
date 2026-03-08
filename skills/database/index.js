/**
 * Database Skill
 * SQLite via better-sqlite3.
 */
import { join } from 'path';
import { mkdirSync } from 'fs';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
const DEFAULT_DB = join(HOME, '.openbot', 'data.db');

function getDb(dbPath) {
  const { default: Database } = require('better-sqlite3');
  mkdirSync(join(dbPath, '..'), { recursive: true });
  return new Database(dbPath);
}

export default async function execute({ action, sql, db: dbPath = DEFAULT_DB, table }) {
  const Database = (await import('better-sqlite3')).default;
  mkdirSync(join(dbPath, '..'), { recursive: true });
  const db = new Database(dbPath);

  try {
    switch (action) {
      case 'tables': {
        const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
        if (!rows.length) return 'No tables found in database.';
        return `Tables in ${dbPath}:\n${rows.map(r => `  • ${r.name}`).join('\n')}`;
      }
      case 'schema': {
        if (!table) throw new Error('table required for schema');
        const rows = db.prepare(`PRAGMA table_info(${table})`).all();
        if (!rows.length) throw new Error(`Table not found: ${table}`);
        const cols = rows.map(r => `  ${r.name} ${r.type}${r.notnull ? ' NOT NULL' : ''}${r.pk ? ' PRIMARY KEY' : ''}`);
        return `Schema for ${table}:\n${cols.join('\n')}`;
      }
      case 'query': {
        if (!sql) throw new Error('sql required');
        const rows = db.prepare(sql).all();
        if (!rows.length) return 'Query returned no results.';
        const headers = Object.keys(rows[0]);
        const separator = headers.map(h => '-'.repeat(Math.max(h.length, 10))).join(' | ');
        const headerRow = headers.join(' | ');
        const dataRows = rows.slice(0, 50).map(r => headers.map(h => String(r[h] ?? '')).join(' | '));
        return `Results (${rows.length} rows):\n${headerRow}\n${separator}\n${dataRows.join('\n')}${rows.length > 50 ? '\n... (truncated)' : ''}`;
      }
      case 'execute': {
        if (!sql) throw new Error('sql required');
        const info = db.prepare(sql).run();
        return `✅ Executed. Changes: ${info.changes}, Last ID: ${info.lastInsertRowid}`;
      }
      case 'export': {
        if (!table) throw new Error('table required for export');
        const rows = db.prepare(`SELECT * FROM ${table}`).all();
        if (!rows.length) return `Table ${table} is empty.`;
        const headers = Object.keys(rows[0]);
        const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
        const { writeFileSync } = await import('fs');
        const outPath = join(HOME, '.openbot', `${table}-export-${Date.now()}.csv`);
        writeFileSync(outPath, csv);
        return `✅ Exported ${rows.length} rows to: ${outPath}`;
      }
      default: throw new Error(`Unknown action: ${action}`);
    }
  } finally {
    db.close();
  }
}
