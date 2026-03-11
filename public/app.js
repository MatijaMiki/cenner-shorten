import { initApiBase, apiUrl, getApiBase } from './api.js';

const form = document.getElementById('form');
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const messageEl = document.getElementById('message');
const codeInput = document.getElementById('code');
const deleteModal = document.getElementById('deleteModal');
const deleteModalCode = document.getElementById('deleteModalCode');
const deleteCancel = document.getElementById('deleteCancel');
const deleteConfirm = document.getElementById('deleteConfirm');
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const editCode = document.getElementById('editCode');
const editUrl = document.getElementById('editUrl');
const editNotes = document.getElementById('editNotes');
const editCancel = document.getElementById('editCancel');
const listSection = document.getElementById('listSection');
const drawerToggle = document.getElementById('drawerToggle');
const drawerClose = document.getElementById('drawerClose');
const drawerBackdrop = document.getElementById('drawerBackdrop');
const drawerBadge = document.getElementById('drawerBadge');

const icons = {
  open: '<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 3h6v6M10 14L17 3M3 17V7a2 2 0 012-2h4"/></svg>',
  copy: '<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="6" y="6" width="10" height="10" rx="1"/><path d="M5 14H4a2 2 0 01-2-2V6a2 2 0 012-2h2"/></svg>',
  edit: '<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2l4 4-10 10H4v-4L14 2z"/><path d="M12 4l4 4"/></svg>',
  delete: '<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h12v10a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/><path d="M2 6h16M8 6V4a2 2 0 012-2h0a2 2 0 012 2v2"/></svg>',
  chevron: '<svg class="icon icon-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 8l5 5 5-5"/></svg>',
};

// Promise-based delete confirmation modal
let _deleteResolve = null;

function showDeleteConfirm(code) {
  return new Promise((resolve) => {
    deleteModalCode.textContent = `/${code}`;
    deleteModal.classList.add('modal-visible');
    deleteModal.setAttribute('aria-hidden', 'false');
    _deleteResolve = resolve;
    deleteConfirm.focus();
  });
}

function closeDeleteModal(result) {
  deleteModal.classList.remove('modal-visible');
  deleteModal.setAttribute('aria-hidden', 'true');
  if (_deleteResolve) { _deleteResolve(result); _deleteResolve = null; }
}

deleteCancel.addEventListener('click', () => closeDeleteModal(false));
deleteConfirm.addEventListener('click', () => closeDeleteModal(true));
deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) closeDeleteModal(false); });
deleteModal.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDeleteModal(false); });

function showMessage(text, type = 'success') {
  messageEl.textContent = text;
  messageEl.className = 'message ' + type;
  messageEl.style.display = 'block';
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => {
    messageEl.textContent = '';
    messageEl.className = 'message';
  }, 4000);
}

function formatDate(createdAt) {
  if (!createdAt) return '—';
  const d = new Date(createdAt);
  return isNaN(d.getTime()) ? createdAt : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function renderList(links) {
  listEl.innerHTML = links
    .map(
      (l) => `
    <li data-code="${escapeAttr(l.short_code)}" class="list-item">
      <div class="list-item-main" role="button" tabindex="0" aria-expanded="false" aria-controls="detail-${escapeAttr(l.short_code)}" id="row-${escapeAttr(l.short_code)}">
        <div class="list-item-text">
          <span class="code">/${escapeHtml(l.short_code)}</span>
          <span class="long" title="${escapeAttr(l.long_url)}">${escapeHtml(l.long_url)}</span>
        </div>
        <span class="actions">
          <a href="${escapeAttr(l.short_url)}" target="_blank" rel="noopener" class="action-btn open" aria-label="Open">${icons.open}</a>
          <a href="#" class="action-btn copy" data-url="${escapeAttr(l.short_url)}" aria-label="Copy short URL">${icons.copy}</a>
          <button type="button" class="action-btn edit" data-code="${escapeAttr(l.short_code)}" data-url="${escapeAttr(l.long_url)}" data-notes="${escapeAttr(l.notes || '')}" aria-label="Edit">${icons.edit}</button>
          <button type="button" class="action-btn delete" aria-label="Delete">${icons.delete}</button>
        </span>
        ${icons.chevron}
      </div>
      <div class="list-item-detail" id="detail-${escapeAttr(l.short_code)}" hidden>
        <div class="detail-row"><strong>Added:</strong> ${escapeHtml(formatDate(l.created_at))}</div>
        <div class="detail-row"><strong>Full URL:</strong> <a href="${escapeAttr(l.long_url)}" target="_blank" rel="noopener" class="detail-link">${escapeHtml(l.long_url)}</a></div>
        ${l.notes ? `<div class="detail-row"><strong>Notes:</strong> ${escapeHtml(l.notes)}</div>` : ''}
        <div class="detail-actions">
          <a href="${escapeAttr(l.long_url)}" target="_blank" rel="noopener" class="btn btn-small">View full link</a>
        </div>
      </div>
    </li>
  `
    )
    .join('');

  emptyEl.classList.toggle('hidden', links.length > 0);
  syncDrawerBadge();

  listEl.querySelectorAll('.list-item-main').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.actions')) return;
      const li = row.closest('li');
      const detail = li.querySelector('.list-item-detail');
      const expanded = detail.hidden;
      listEl.querySelectorAll('.list-item-detail').forEach((d) => { d.hidden = true; });
      listEl.querySelectorAll('.list-item-main').forEach((r) => r.setAttribute('aria-expanded', 'false'));
      if (expanded) {
        detail.hidden = false;
        row.setAttribute('aria-expanded', 'true');
      }
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        row.click();
      }
    });
  });

  listEl.querySelectorAll('.action-btn.copy').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(a.dataset.url).then(
        () => showMessage('Short URL copied to clipboard.'),
        () => showMessage('Copy failed — check browser permissions.', 'error')
      );
    });
  });

  listEl.querySelectorAll('.action-btn.delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const li = btn.closest('li');
      const code = li?.dataset.code;
      if (!code) return;
      const confirmed = await showDeleteConfirm(code);
      if (!confirmed) return;
      try {
        const r = await fetch(apiUrl(`/api/links/${encodeURIComponent(code)}`), { method: 'DELETE' });
        if (!r.ok) throw new Error('Delete failed');
        li.remove();
        if (listEl.children.length === 0) emptyEl.classList.remove('hidden');
        syncDrawerBadge();
      } catch {
        showMessage('Could not delete link.', 'error');
      }
    });
  });

  listEl.querySelectorAll('.action-btn.edit').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editCode.value = btn.dataset.code;
      editUrl.value = btn.dataset.url || '';
      editNotes.value = btn.dataset.notes || '';
      editModal.classList.add('modal-visible');
      editModal.setAttribute('aria-hidden', 'false');
      editUrl.focus();
    });
  });
}

function escapeAttr(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML.replace(/"/g, '&quot;');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function shortCodeHelpText() {
  return 'Short code may contain only letters (A–Z), numbers (0–9), underscore (_) and hyphen (-), up to 32 characters.';
}

if (codeInput) {
  codeInput.addEventListener('invalid', () => {
    if (codeInput.validity.patternMismatch) {
      codeInput.setCustomValidity(shortCodeHelpText());
    } else {
      codeInput.setCustomValidity('');
    }
  });
  codeInput.addEventListener('input', () => codeInput.setCustomValidity(''));
}

async function loadList() {
  try {
    const r = await fetch(apiUrl('/api/links'));
    if (!r.ok) throw new Error('Failed to load');
    const links = await r.json();
    renderList(links);
  } catch (e) {
    showMessage('Cannot reach backend.', 'error');
    renderList([]);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = form.querySelector('#submit');
  const url = form.url.value.trim();
  const code = form.code.value.trim() || undefined;
  const notes = form.notes.value.trim() || undefined;
  submitBtn.disabled = true;
  messageEl.textContent = '';
  try {
    const r = await fetch(apiUrl('/api/links'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, code, notes }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      showMessage(data.error || 'Something went wrong.', 'error');
      return;
    }
    form.url.value = '';
    form.code.value = '';
    form.notes.value = '';
    form.url.focus();
    const base = (getApiBase() || window.location.origin || '').replace(/\/+$/, '');
    const createdUrl =
      data.short_url ||
      data.shortUrl ||
      (data.short_code ? `${base}/${data.short_code}` : undefined) ||
      (data.shortCode ? `${base}/${data.shortCode}` : undefined);
    showMessage(createdUrl ? `Created: ${createdUrl}` : 'Created.');
    await loadList();
  } catch (err) {
    showMessage('Cannot reach backend.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

function closeEditModal() {
  editModal.classList.remove('modal-visible');
  editModal.setAttribute('aria-hidden', 'true');
}

editCancel.addEventListener('click', closeEditModal);
editModal.addEventListener('click', (e) => {
  if (e.target === editModal) closeEditModal();
});
editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = editCode.value.trim();
  const url = editUrl.value.trim();
  const notes = editNotes.value.trim();
  const longUrl = url.startsWith('http') ? url : 'https://' + url;
  try {
    const r = await fetch(apiUrl(`/api/links/${encodeURIComponent(code)}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ long_url: longUrl, notes }),
    });
    if (!r.ok) throw new Error('Update failed');
    closeEditModal();
    showMessage('Link updated.');
    await loadList();
  } catch {
    showMessage('Could not update link.', 'error');
  }
});

// ── Drawer ────────────────────────────────────────────────────
function syncDrawerBadge() {
  if (!drawerBadge) return;
  const count = listEl.children.length;
  if (count > 0) {
    drawerBadge.textContent = count > 99 ? '99+' : String(count);
    drawerBadge.hidden = false;
  } else {
    drawerBadge.hidden = true;
  }
}

function openDrawer() {
  listSection?.classList.add('drawer-open');
  drawerBackdrop?.classList.add('drawer-open');
  drawerToggle?.setAttribute('aria-expanded', 'true');
  drawerClose?.focus();
}

function closeDrawer() {
  listSection?.classList.remove('drawer-open');
  drawerBackdrop?.classList.remove('drawer-open');
  drawerToggle?.setAttribute('aria-expanded', 'false');
  drawerToggle?.focus();
}

drawerToggle?.addEventListener('click', openDrawer);
drawerClose?.addEventListener('click', closeDrawer);
drawerBackdrop?.addEventListener('click', closeDrawer);

document.addEventListener('keydown', (e) => {
  if (
    e.key === 'Escape' &&
    listSection?.classList.contains('drawer-open') &&
    !deleteModal.classList.contains('modal-visible') &&
    !editModal.classList.contains('modal-visible')
  ) {
    closeDrawer();
  }
});

// Init: load stored API base then load list
(async () => {
  await initApiBase();
  await loadList();
})();
