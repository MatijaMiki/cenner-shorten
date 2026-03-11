import express from 'express';
import { createLink, getByShortCode, listLinks, deleteLink, updateLink } from './db.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3333;

// Allowed CORS origins: Capacitor native app + local dev. Extend via ALLOWED_ORIGINS env var.
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || `capacitor://localhost,ionic://localhost,http://localhost:${PORT},http://127.0.0.1:${PORT}`)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

// Security headers
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

// CORS — allowlist only (no wildcard echo-back)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '16kb' }));
app.use(express.static(join(__dirname, 'public')));

// Validate that a URL uses http or https
function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Short code must match the same pattern enforced on the frontend
const SHORT_CODE_RE = /^[a-zA-Z0-9_-]{1,32}$/;

// API: create short link
app.post('/api/links', async (req, res, next) => {
  try {
    const { url, code, notes } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }
    if (url.length > 2048) {
      return res.status(400).json({ error: 'URL is too long (max 2048 characters)' });
    }
    const longUrl = url.startsWith('http') ? url : 'https://' + url;
    if (!isValidUrl(longUrl)) {
      return res.status(400).json({ error: 'Invalid URL — must use http or https' });
    }
    if (code != null && !SHORT_CODE_RE.test(code)) {
      return res.status(400).json({ error: 'Invalid short code — use letters, numbers, _ or - (max 32)' });
    }
    const base = req.protocol + '://' + req.get('host');
    const shortCode = createLink(longUrl, code || null, notes || '');
    res.status(201).json({
      short_code: shortCode,
      short_url: `${base}/${shortCode}`,
      long_url: longUrl,
    });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'That short code is already taken' });
    }
    next(e);
  }
});

// API: list all links
app.get('/api/links', (req, res, next) => {
  try {
    const links = listLinks();
    const base = req.protocol + '://' + req.get('host');
    res.json(links.map((l) => ({ ...l, short_url: `${base}/${l.short_code}` })));
  } catch (e) {
    next(e);
  }
});

// API: update link (long_url, notes)
app.patch('/api/links/:code', (req, res, next) => {
  try {
    const { long_url, notes } = req.body || {};
    if (long_url != null) {
      if (typeof long_url !== 'string' || long_url.length > 2048 || !isValidUrl(long_url)) {
        return res.status(400).json({ error: 'Invalid URL' });
      }
    }
    const ok = updateLink(req.params.code, { long_url, notes });
    if (!ok) return res.status(404).json({ error: 'Link not found' });
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// API: delete link
app.delete('/api/links/:code', (req, res, next) => {
  try {
    const ok = deleteLink(req.params.code);
    if (!ok) return res.status(404).json({ error: 'Link not found' });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

// Redirect: GET /:code (must be last so /api/* and static files are not captured)
app.get('/:code', (req, res, next) => {
  try {
    const longUrl = getByShortCode(req.params.code);
    if (!longUrl) return res.status(404).send('Link not found');
    // Guard against stored non-http URLs (belt-and-suspenders)
    if (!isValidUrl(longUrl)) return res.status(400).send('Invalid link destination');
    res.redirect(302, longUrl);
  } catch (e) {
    next(e);
  }
});

// Generic error handler — hides internals from clients
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`URL shortener running at http://localhost:${PORT}`);
});
