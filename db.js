import Database from 'better-sqlite3';
import { customAlphabet } from 'nanoid';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, 'links.db');

// Ensure the directory exists (important when DB_PATH=/data/links.db and /data is a fresh volume)
mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_code TEXT UNIQUE NOT NULL,
    long_url TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    -- for future public use: owner_id, clicks, etc.
    notes TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_links_short_code ON links(short_code);
`);

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 6);

export function createLink(longUrl, shortCode = null, notes = '') {
  const code = shortCode?.trim() || nanoid();
  db.prepare('INSERT INTO links (short_code, long_url, notes) VALUES (?, ?, ?)').run(
    code.toLowerCase(),
    longUrl,
    notes || ''
  );
  return code;
}

export function getByShortCode(shortCode) {
  const row = db.prepare('SELECT long_url FROM links WHERE short_code = ?').get(shortCode.toLowerCase());
  return row ? row.long_url : null;
}

export function listLinks() {
  return db.prepare('SELECT short_code, long_url, created_at, notes FROM links ORDER BY created_at DESC').all();
}

export function deleteLink(shortCode) {
  const result = db.prepare('DELETE FROM links WHERE short_code = ?').run(shortCode.toLowerCase());
  return result.changes > 0;
}

export function updateLink(shortCode, { long_url, notes }) {
  const code = shortCode.toLowerCase();
  if (long_url != null) {
    db.prepare('UPDATE links SET long_url = ? WHERE short_code = ?').run(long_url, code);
  }
  if (notes !== undefined) {
    db.prepare('UPDATE links SET notes = ? WHERE short_code = ?').run(notes ?? '', code);
  }
  return db.prepare('SELECT short_code FROM links WHERE short_code = ?').get(code) != null;
}

export default db;
