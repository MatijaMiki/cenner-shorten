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
  CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_code TEXT NOT NULL,
    long_url TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    ip TEXT,
    user_agent TEXT,
    referer TEXT,
    ref_host TEXT,
    country TEXT,
    region TEXT,
    city TEXT,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    is_bot INTEGER DEFAULT 0,
    source_type TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_clicks_created_at ON clicks(created_at);
  CREATE INDEX IF NOT EXISTS idx_clicks_short_code ON clicks(short_code);
  CREATE INDEX IF NOT EXISTS idx_clicks_source_type ON clicks(source_type);
  CREATE INDEX IF NOT EXISTS idx_clicks_country ON clicks(country);
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    ip TEXT,
    user_agent TEXT,
    device_type TEXT,
    browser TEXT,
    os TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
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

export function logClick({
  short_code,
  long_url,
  ip,
  user_agent,
  referer,
  ref_host,
  country,
  region,
  city,
  device_type,
  browser,
  os,
  is_bot,
  source_type,
}) {
  db.prepare(
    `INSERT INTO clicks
      (short_code, long_url, ip, user_agent, referer, ref_host, country, region, city, device_type, browser, os, is_bot, source_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    short_code,
    long_url,
    ip || null,
    user_agent || null,
    referer || null,
    ref_host || null,
    country || null,
    region || null,
    city || null,
    device_type || null,
    browser || null,
    os || null,
    is_bot ? 1 : 0,
    source_type || null
  );
}

export function logEvent({ event_type, ip, user_agent, device_type, browser, os }) {
  db.prepare(
    `INSERT INTO events
      (event_type, ip, user_agent, device_type, browser, os)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(event_type, ip || null, user_agent || null, device_type || null, browser || null, os || null);
}

export function getAnalyticsSummary({ days = 30 } = {}) {
  const rangeDays = Number.isFinite(days) ? Math.max(1, Math.min(365, Math.floor(days))) : 30;
  const since = `-${rangeDays} days`;

  const totals = db.prepare(
    `SELECT
        COUNT(*) AS clicks,
        COUNT(DISTINCT CASE WHEN ip IS NOT NULL AND ip != '' THEN ip END) AS unique_users,
        COUNT(DISTINCT CASE WHEN source_type = 'organic' AND ip IS NOT NULL AND ip != '' THEN ip END) AS organic_users
     FROM clicks
     WHERE is_bot = 0 AND created_at >= datetime('now', ?)`
  ).get(since);

  const last24h = db
    .prepare(`SELECT COUNT(*) AS count FROM clicks WHERE is_bot = 0 AND created_at >= datetime('now', '-24 hours')`)
    .get();

  const sources = db
    .prepare(
      `SELECT source_type AS label, COUNT(*) AS count
       FROM clicks
       WHERE is_bot = 0 AND created_at >= datetime('now', ?)
       GROUP BY source_type
       ORDER BY count DESC`
    )
    .all(since);

  const clicksByDay = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
       FROM clicks
       WHERE is_bot = 0 AND created_at >= datetime('now', ?)
       GROUP BY day
       ORDER BY day ASC`
    )
    .all(since);

  const topLinks = db
    .prepare(
      `SELECT short_code, long_url, COUNT(*) AS clicks
       FROM clicks
       WHERE is_bot = 0 AND created_at >= datetime('now', ?)
       GROUP BY short_code, long_url
       ORDER BY clicks DESC
       LIMIT 10`
    )
    .all(since);

  const topReferrers = db
    .prepare(
      `SELECT ref_host AS referrer, COUNT(*) AS count
       FROM clicks
       WHERE is_bot = 0 AND created_at >= datetime('now', ?)
         AND ref_host IS NOT NULL AND ref_host != ''
       GROUP BY ref_host
       ORDER BY count DESC
       LIMIT 10`
    )
    .all(since);

  const topCountries = db
    .prepare(
      `SELECT COALESCE(country, 'Unknown') AS country, COUNT(*) AS count
       FROM clicks
       WHERE is_bot = 0 AND created_at >= datetime('now', ?)
       GROUP BY country
       ORDER BY count DESC
       LIMIT 10`
    )
    .all(since);

  const devices = db
    .prepare(
      `SELECT COALESCE(device_type, 'Unknown') AS label, COUNT(*) AS count
       FROM clicks
       WHERE is_bot = 0 AND created_at >= datetime('now', ?)
       GROUP BY device_type
       ORDER BY count DESC`
    )
    .all(since);

  const browsers = db
    .prepare(
      `SELECT COALESCE(browser, 'Unknown') AS label, COUNT(*) AS count
       FROM clicks
       WHERE is_bot = 0 AND created_at >= datetime('now', ?)
       GROUP BY browser
       ORDER BY count DESC`
    )
    .all(since);

  const os = db
    .prepare(
      `SELECT COALESCE(os, 'Unknown') AS label, COUNT(*) AS count
       FROM clicks
       WHERE is_bot = 0 AND created_at >= datetime('now', ?)
       GROUP BY os
       ORDER BY count DESC`
    )
    .all(since);

  const appEvents = db
    .prepare(
      `SELECT event_type AS label, COUNT(*) AS count
       FROM events
       WHERE created_at >= datetime('now', ?)
       GROUP BY event_type
       ORDER BY count DESC`
    )
    .all(since);

  return {
    range_days: rangeDays,
    generated_at: new Date().toISOString(),
    totals: {
      clicks: totals?.clicks || 0,
      unique_users: totals?.unique_users || 0,
      organic_users: totals?.organic_users || 0,
      last_24h_clicks: last24h?.count || 0,
    },
    sources,
    clicks_by_day: clicksByDay,
    top_links: topLinks,
    top_referrers: topReferrers,
    top_countries: topCountries,
    devices,
    browsers,
    os,
    app_events: appEvents,
  };
}

export default db;
