/**
 * Configurable API base for Shorten.
 * Browser: same-origin or localStorage. Capacitor: Preferences.
 */
const STORAGE_KEY = 'shorten_api_base';
const TOKEN_KEY = 'shorten_app_token';
let apiBase = '';
const NATIVE_API_BASE = 'http://192.168.1.5:3333';

function isCapacitor() {
  return typeof window !== 'undefined' && window.Capacitor != null;
}

async function readStored() {
  if (isCapacitor() && window.Capacitor.Preferences) {
    const { value } = await window.Capacitor.Preferences.get({ key: STORAGE_KEY });
    return value != null ? value : '';
  }
  return localStorage.getItem(STORAGE_KEY) || '';
}

async function writeStored(url) {
  const val = (url || '').trim().replace(/\/+$/, '');
  if (isCapacitor() && window.Capacitor.Preferences) {
    await window.Capacitor.Preferences.set({ key: STORAGE_KEY, value: val });
  } else {
    localStorage.setItem(STORAGE_KEY, val);
  }
  apiBase = val;
  return val;
}

export function getApiBase() {
  return apiBase;
}

export async function initApiBase() {
  if (isCapacitor()) {
    apiBase = NATIVE_API_BASE;
    return apiBase;
  }
  apiBase = await readStored();
  return apiBase;
}

export async function saveApiBase(url) {
  return writeStored(url);
}

export function apiUrl(path) {
  const base = apiBase;
  const p = path.startsWith('/') ? path : '/' + path;
  if (!base) return p;
  return base.replace(/\/+$/, '') + p;
}

export function getAuthHeaders() {
  try {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
