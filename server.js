import express from 'express';
import crypto from 'crypto';
import UAParser from 'ua-parser-js';
import geoip from 'geoip-lite';
import { isbot } from 'isbot';
import { createLink, getByShortCode, listLinks, deleteLink, updateLink, logClick, logEvent, getAnalyticsSummary } from './db.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3333;
const DASH_USER = process.env.DASH_USER;
const DASH_PASS = process.env.DASH_PASS;
const APP_TOKEN = process.env.APP_TOKEN || '';
const HSTS_ENABLED = process.env.HSTS_ENABLED === 'true';

// Allowed CORS origins: Capacitor native app + local dev. Extend via ALLOWED_ORIGINS env var.
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || `capacitor://localhost,ionic://localhost,http://localhost:${PORT},http://127.0.0.1:${PORT}`)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

app.set('trust proxy', 1);
app.disable('x-powered-by');

// Security headers
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "font-src 'self' https://fonts.gstatic.com data:",
      "style-src 'self' https://fonts.googleapis.com",
      "script-src 'self'",
      "connect-src 'self' https: http:",
    ].join('; ')
  );
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
  if (HSTS_ENABLED && (req.secure || req.get('x-forwarded-proto') === 'https')) {
    res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
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

const rateBuckets = new Map();

function rateLimit({ windowMs, max, keyFn, message }) {
  return (req, res, next) => {
    const key = keyFn(req);
    if (!key) return next();
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.reset) {
      rateBuckets.set(key, { count: 1, reset: now + windowMs });
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(max - 1));
      res.set('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)));
      return next();
    }
    if (bucket.count >= max) {
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', String(Math.ceil(bucket.reset / 1000)));
      return res.status(429).json({ error: message || 'Too many requests' });
    }
    bucket.count += 1;
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.set('X-RateLimit-Reset', String(Math.ceil(bucket.reset / 1000)));
    next();
  };
}

function parseBasicAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx === -1) return null;
  return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireDashboardAuth(req, res, next) {
  if (!DASH_USER || !DASH_PASS) {
    return res.status(503).send('Dashboard not configured');
  }
  const creds = parseBasicAuth(req);
  const ok = creds && safeEqual(creds.user, DASH_USER) && safeEqual(creds.pass, DASH_PASS);
  if (!ok) {
    res.set('WWW-Authenticate', 'Basic realm="Shorten Analytics"');
    return res.status(401).send('Unauthorized');
  }
  next();
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return xf.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || '';
}

function parseUaDetails(userAgent = '') {
  const parsed = new UAParser(userAgent).getResult();
  const deviceType = parsed.device?.type || 'desktop';
  const browser = [parsed.browser?.name, parsed.browser?.major].filter(Boolean).join(' ');
  const os = [parsed.os?.name, parsed.os?.version].filter(Boolean).join(' ');
  return {
    device_type: deviceType,
    browser: browser || 'Unknown',
    os: os || 'Unknown',
  };
}

const SEARCH_ENGINES = [
  'google.',
  'bing.com',
  'yahoo.',
  'duckduckgo.com',
  'baidu.com',
  'yandex.',
  'startpage.com',
  'ecosia.org',
  'search.brave.com',
  'brave.com',
];

function extractRefHost(referer) {
  try {
    const u = new URL(referer);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function hasCampaignParams(referer) {
  try {
    const u = new URL(referer);
    for (const key of u.searchParams.keys()) {
      if (key.toLowerCase().startsWith('utm_')) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function classifySource(referer) {
  if (!referer) return 'direct';
  const host = extractRefHost(referer);
  if (hasCampaignParams(referer)) return 'campaign';
  if (SEARCH_ENGINES.some((h) => host.includes(h))) return 'organic';
  return host ? 'referral' : 'direct';
}

function requireAppToken(req, res, next) {
  if (!APP_TOKEN) return next();
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.get('x-app-token');
  if (!token || token !== APP_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use((req, res, next) => {
  if (req.path === '/dashboard' || req.path.startsWith('/dashboard.') || req.path.startsWith('/api/analytics')) {
    return requireDashboardAuth(req, res, next);
  }
  next();
});

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
const RESERVED_CODES = new Set([
  'api',
  'dashboard',
  'dashboard.css',
  'dashboard.js',
  'terms',
  'terms.html',
  'app.js',
  'api.js',
  'styles.css',
  'favicon.ico',
]);

// API: create short link
app.post('/api/links', requireAppToken, async (req, res, next) => {
  try {
    const limiter = rateLimit({
      windowMs: 60_000,
      max: 60,
      keyFn: (r) => `create:${getClientIp(r)}`,
      message: 'Rate limit exceeded',
    });
    return limiter(req, res, async () => {
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
    if (code && RESERVED_CODES.has(code.toLowerCase())) {
      return res.status(400).json({ error: 'That short code is reserved' });
    }
    if (notes && String(notes).length > 512) {
      return res.status(400).json({ error: 'Notes is too long (max 512 characters)' });
    }
    const base = req.protocol + '://' + req.get('host');
    const shortCode = createLink(longUrl, code || null, notes || '');
    const ua = req.get('user-agent') || '';
    const { device_type, browser, os } = parseUaDetails(ua);
    logEvent({ event_type: 'create_link', ip: getClientIp(req), user_agent: ua, device_type, browser, os });
    res.status(201).json({
      short_code: shortCode,
      short_url: `${base}/${shortCode}`,
      long_url: longUrl,
    });
    });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'That short code is already taken' });
    }
    next(e);
  }
});

// API: list all links
app.get('/api/links', requireAppToken, (req, res, next) => {
  try {
    const limiter = rateLimit({
      windowMs: 60_000,
      max: 60,
      keyFn: (r) => `list:${getClientIp(r)}`,
      message: 'Rate limit exceeded',
    });
    return limiter(req, res, () => {
    const links = listLinks();
    const base = req.protocol + '://' + req.get('host');
    const ua = req.get('user-agent') || '';
    const { device_type, browser, os } = parseUaDetails(ua);
    logEvent({ event_type: 'list_links', ip: getClientIp(req), user_agent: ua, device_type, browser, os });
    res.json(links.map((l) => ({ ...l, short_url: `${base}/${l.short_code}` })));
    });
  } catch (e) {
    next(e);
  }
});

// API: update link (long_url, notes)
app.patch('/api/links/:code', requireAppToken, (req, res, next) => {
  try {
    const limiter = rateLimit({
      windowMs: 60_000,
      max: 60,
      keyFn: (r) => `edit:${getClientIp(r)}`,
      message: 'Rate limit exceeded',
    });
    return limiter(req, res, () => {
    const { long_url, notes } = req.body || {};
    if (long_url != null) {
      if (typeof long_url !== 'string' || long_url.length > 2048 || !isValidUrl(long_url)) {
        return res.status(400).json({ error: 'Invalid URL' });
      }
    }
    const ok = updateLink(req.params.code, { long_url, notes });
    if (!ok) return res.status(404).json({ error: 'Link not found' });
    const ua = req.get('user-agent') || '';
    const { device_type, browser, os } = parseUaDetails(ua);
    logEvent({ event_type: 'edit_link', ip: getClientIp(req), user_agent: ua, device_type, browser, os });
    res.status(200).json({ ok: true });
    });
  } catch (e) {
    next(e);
  }
});

// API: delete link
app.delete('/api/links/:code', requireAppToken, (req, res, next) => {
  try {
    const limiter = rateLimit({
      windowMs: 60_000,
      max: 60,
      keyFn: (r) => `del:${getClientIp(r)}`,
      message: 'Rate limit exceeded',
    });
    return limiter(req, res, () => {
    const ok = deleteLink(req.params.code);
    if (!ok) return res.status(404).json({ error: 'Link not found' });
    const ua = req.get('user-agent') || '';
    const { device_type, browser, os } = parseUaDetails(ua);
    logEvent({ event_type: 'delete_link', ip: getClientIp(req), user_agent: ua, device_type, browser, os });
    res.status(204).send();
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/analytics/summary', (req, res, next) => {
  try {
    const limiter = rateLimit({
      windowMs: 60_000,
      max: 30,
      keyFn: (r) => `analytics:${getClientIp(r)}`,
      message: 'Rate limit exceeded',
    });
    return limiter(req, res, () => {
    const days = Number(req.query.days || 30);
    const summary = getAnalyticsSummary({ days });
    res.set('Cache-Control', 'no-store');
    res.json(summary);
    });
  } catch (e) {
    next(e);
  }
});

app.get('/dashboard', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(join(__dirname, 'public', 'dashboard.html'));
});

// Redirect: GET /:code (must be last so /api/* and static files are not captured)
app.get('/:code', (req, res, next) => {
  try {
    const limiter = rateLimit({
      windowMs: 60_000,
      max: 120,
      keyFn: (r) => `redir:${getClientIp(r)}`,
      message: 'Rate limit exceeded',
    });
    return limiter(req, res, () => {
    const longUrl = getByShortCode(req.params.code);
    if (!longUrl) return res.status(404).send('Link not found');
    // Guard against stored non-http URLs (belt-and-suspenders)
    if (!isValidUrl(longUrl)) return res.status(400).send('Invalid link destination');
    const userAgent = req.get('user-agent') || '';
    const referer = req.get('referer') || '';
    const ip = getClientIp(req);
    const geo = ip ? geoip.lookup(ip) : null;
    const { device_type, browser, os } = parseUaDetails(userAgent);
    const sourceType = classifySource(referer);
    logClick({
      short_code: req.params.code.toLowerCase(),
      long_url: longUrl,
      ip,
      user_agent: userAgent,
      referer,
      ref_host: extractRefHost(referer),
      country: geo?.country || null,
      region: geo?.region || null,
      city: geo?.city || null,
      device_type,
      browser,
      os,
      is_bot: isbot(userAgent),
      source_type: sourceType,
    });
    res.redirect(302, longUrl);
    });
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
