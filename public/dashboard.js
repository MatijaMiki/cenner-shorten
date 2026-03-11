const kpiClicks = document.getElementById('kpiClicks');
const kpiUsers = document.getElementById('kpiUsers');
const kpiOrganic = document.getElementById('kpiOrganic');
const kpiLast24 = document.getElementById('kpiLast24');
const sourcesEl = document.getElementById('sources');
const countriesEl = document.getElementById('countries');
const referrersEl = document.getElementById('referrers');
const devicesEl = document.getElementById('devices');
const browsersEl = document.getElementById('browsers');
const osEl = document.getElementById('os');
const topLinksEl = document.getElementById('topLinks');
const appUsageEl = document.getElementById('appUsage');
const sparklineEl = document.getElementById('sparkline');
const sparkSub = document.getElementById('sparkSub');
const rangeLabel = document.getElementById('rangeLabel');
const refreshBtn = document.getElementById('refreshBtn');
const toast = document.getElementById('toast');

const DEFAULT_DAYS = 30;
const fmt = new Intl.NumberFormat();

function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2200);
}

function setText(el, text) {
  if (el) el.textContent = text;
}

function mapSourceLabel(label) {
  switch (label) {
    case 'direct':
      return 'Direct';
    case 'organic':
      return 'Organic';
    case 'referral':
      return 'Referral';
    case 'campaign':
      return 'Campaign';
    default:
      return 'Unknown';
  }
}

function renderBarList(container, items, options = {}) {
  if (!container) return;
  container.innerHTML = '';
  if (!items || items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = options.emptyText || 'No data yet.';
    container.appendChild(empty);
    return;
  }
  const max = Math.max(...items.map((i) => i.count));
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'bar-item';

    const label = document.createElement('div');
    label.className = 'bar-label';
    const left = document.createElement('span');
    left.textContent = item.label;
    const right = document.createElement('span');
    right.textContent = fmt.format(item.count);
    label.append(left, right);

    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = max ? `${Math.max(4, (item.count / max) * 100)}%` : '0%';
    bar.appendChild(fill);

    row.append(label, bar);
    container.appendChild(row);
  });
}

function renderList(container, items, options = {}) {
  if (!container) return;
  container.innerHTML = '';
  if (!items || items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = options.emptyText || 'No data yet.';
    container.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'list-item';
    const title = document.createElement('div');
    title.className = 'list-item-title';
    title.textContent = item.title;
    const sub = document.createElement('div');
    sub.className = 'list-item-sub';
    sub.textContent = item.sub || '';
    const meta = document.createElement('div');
    meta.className = 'list-item-meta';
    meta.textContent = fmt.format(item.count) + ' clicks';
    card.append(title, sub, meta);
    container.appendChild(card);
  });
}

function buildDays(rangeDays) {
  const days = [];
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - (rangeDays - 1));
  for (let i = 0; i < rangeDays; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function renderSparkline(series, rangeDays) {
  if (!sparklineEl) return;
  sparklineEl.innerHTML = '';
  if (!series || series.length === 0) {
    sparklineEl.innerHTML = '<div class="empty">No data yet.</div>';
    return;
  }

  const points = buildDays(rangeDays).map((day) => series[day] || 0);
  const max = Math.max(...points, 1);
  const width = 600;
  const height = 140;
  const step = width / (points.length - 1 || 1);
  const coords = points
    .map((val, idx) => {
      const x = idx * step;
      const y = height - (val / max) * (height - 20) - 10;
      return `${x},${y}`;
    })
    .join(' ');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const grid = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  grid.setAttribute('d', `M0 ${height - 10} H${width}`);
  grid.setAttribute('stroke', 'rgba(255,255,255,0.1)');
  grid.setAttribute('stroke-width', '1');
  svg.appendChild(grid);

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', coords);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#4cc7b5');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linecap', 'round');
  svg.appendChild(line);

  sparklineEl.appendChild(svg);
}

async function loadSummary() {
  try {
    setText(rangeLabel, `Last ${DEFAULT_DAYS} days`);
    const r = await fetch(`/api/analytics/summary?days=${DEFAULT_DAYS}`);
    if (r.status === 401) {
      showToast('Unauthorized');
      return;
    }
    if (!r.ok) throw new Error('Failed');
    const data = await r.json();

    setText(kpiClicks, fmt.format(data.totals?.clicks || 0));
    setText(kpiUsers, fmt.format(data.totals?.unique_users || 0));
    setText(kpiOrganic, fmt.format(data.totals?.organic_users || 0));
    setText(kpiLast24, fmt.format(data.totals?.last_24h_clicks || 0));

    const sourceItems = (data.sources || []).map((s) => ({
      label: mapSourceLabel(s.label || ''),
      count: s.count || 0,
    }));
    renderBarList(sourcesEl, sourceItems, { emptyText: 'No traffic sources yet.' });

    const daySeries = {};
    (data.clicks_by_day || []).forEach((d) => {
      daySeries[d.day] = d.count || 0;
    });
    renderSparkline(daySeries, data.range_days || DEFAULT_DAYS);
    sparkSub.textContent = (data.clicks_by_day || []).length ? `Updated ${new Date().toLocaleString()}` : 'No data yet';

    renderList(
      topLinksEl,
      (data.top_links || []).map((l) => ({
        title: `/${l.short_code}`,
        sub: l.long_url,
        count: l.clicks || 0,
      })),
      { emptyText: 'No link clicks yet.' }
    );

    renderBarList(
      countriesEl,
      (data.top_countries || []).map((c) => ({ label: c.country || 'Unknown', count: c.count || 0 })),
      { emptyText: 'No country data yet.' }
    );

    renderBarList(
      referrersEl,
      (data.top_referrers || []).map((r) => ({ label: r.referrer || 'Unknown', count: r.count || 0 })),
      { emptyText: 'No referrers yet.' }
    );

    renderBarList(
      devicesEl,
      (data.devices || []).map((d) => ({ label: d.label || 'Unknown', count: d.count || 0 })),
      { emptyText: 'No device data yet.' }
    );

    renderBarList(
      browsersEl,
      (data.browsers || []).map((b) => ({ label: b.label || 'Unknown', count: b.count || 0 })),
      { emptyText: 'No browser data yet.' }
    );

    renderBarList(
      osEl,
      (data.os || []).map((o) => ({ label: o.label || 'Unknown', count: o.count || 0 })),
      { emptyText: 'No OS data yet.' }
    );

    const eventLabels = {
      create_link: 'Create link',
      list_links: 'View links',
      edit_link: 'Edit link',
      delete_link: 'Delete link',
    };
    renderBarList(
      appUsageEl,
      (data.app_events || []).map((e) => ({
        label: eventLabels[e.label] || e.label,
        count: e.count || 0,
      })),
      { emptyText: 'No app usage yet.' }
    );
  } catch (err) {
    showToast('Could not load analytics.');
  }
}

refreshBtn?.addEventListener('click', () => {
  showToast('Refreshing...');
  loadSummary();
});

loadSummary();
