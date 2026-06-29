/**
 * FocusLock — Storage Layer
 * All chrome.storage.local access is centralised here.
 * Keys are prefixed to avoid namespace collisions.
 */

/* ─── Sites ────────────────────────────────────────────────────────────── */

async function storageSites_get() {
  const r = await chrome.storage.local.get(STORAGE_KEYS.SITES);
  return r[STORAGE_KEYS.SITES] || [];
}

async function storageSites_set(sites) {
  return chrome.storage.local.set({ [STORAGE_KEYS.SITES]: sites });
}

/* ─── Usage ─────────────────────────────────────────────────────────────── */

async function storageUsage_get() {
  const r = await chrome.storage.local.get(STORAGE_KEYS.USAGE);
  return r[STORAGE_KEYS.USAGE] || {};
}

async function storageUsage_getToday() {
  const all = await storageUsage_get();
  return all[getTodayKey()] || {};
}

/**
 * Atomically add `delta` seconds to a domain's today usage.
 * Returns the new total seconds for that domain today.
 */
async function storageUsage_increment(domain, delta = 1) {
  const all   = await storageUsage_get();
  const today = getTodayKey();
  if (!all[today]) all[today] = {};
  all[today][domain] = (all[today][domain] || 0) + delta;
  await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: all });
  return all[today][domain];
}

/** Return weekly usage: { 'YYYY-MM-DD': { domain: seconds } } for the last 7 days */
async function storageUsage_getWeekly() {
  const all    = await storageUsage_get();
  const result = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    result[key] = all[key] || {};
  }
  return result;
}

/* ─── Settings ───────────────────────────────────────────────────────────── */

async function storageSettings_get() {
  const r = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(r[STORAGE_KEYS.SETTINGS] || {}) };
}

async function storageSettings_update(patch) {
  const current = await storageSettings_get();
  const next    = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
  return next;
}

/* ─── Protection ─────────────────────────────────────────────────────────── */

async function storageProtection_get() {
  const r = await chrome.storage.local.get(STORAGE_KEYS.PROTECTION_ENABLED);
  return r[STORAGE_KEYS.PROTECTION_ENABLED] !== false; // default ON
}

async function storageProtection_set(enabled) {
  return chrome.storage.local.set({ [STORAGE_KEYS.PROTECTION_ENABLED]: enabled });
}

/* ─── Pause ──────────────────────────────────────────────────────────────── */

/** Returns a timestamp (ms) if paused, or 0 */
async function storagePause_getUntil() {
  const r = await chrome.storage.local.get(STORAGE_KEYS.PAUSE_UNTIL);
  return r[STORAGE_KEYS.PAUSE_UNTIL] || 0;
}

async function storagePause_set(untilMs) {
  return chrome.storage.local.set({ [STORAGE_KEYS.PAUSE_UNTIL]: untilMs });
}

async function storagePause_clear() {
  return chrome.storage.local.set({ [STORAGE_KEYS.PAUSE_UNTIL]: 0 });
}

/* ─── Streaks ────────────────────────────────────────────────────────────── */

async function storageStreaks_get() {
  const r = await chrome.storage.local.get(STORAGE_KEYS.STREAKS);
  return r[STORAGE_KEYS.STREAKS] || { current: 0, longest: 0, lastDate: null };
}

async function storageStreaks_set(streaks) {
  return chrome.storage.local.set({ [STORAGE_KEYS.STREAKS]: streaks });
}

/* ─── Notifications sent ─────────────────────────────────────────────────── */

async function storageNotified_get() {
  const r = await chrome.storage.local.get(STORAGE_KEYS.NOTIFIED);
  return r[STORAGE_KEYS.NOTIFIED] || {};
}

async function storageNotified_mark(domain, marker) {
  const all   = await storageNotified_get();
  const today = getTodayKey();
  if (!all[today])          all[today] = {};
  if (!all[today][domain])  all[today][domain] = [];
  if (!all[today][domain].includes(marker)) all[today][domain].push(marker);
  return chrome.storage.local.set({ [STORAGE_KEYS.NOTIFIED]: all });
}

async function storageNotified_has(domain, marker) {
  const all   = await storageNotified_get();
  const today = getTodayKey();
  return !!(all[today]?.[domain]?.includes(marker));
}

/* ─── First launch ───────────────────────────────────────────────────────── */

async function storageFirstLaunch_get() {
  const r = await chrome.storage.local.get(STORAGE_KEYS.FIRST_LAUNCH);
  return r[STORAGE_KEYS.FIRST_LAUNCH] !== false;
}

async function storageFirstLaunch_done() {
  return chrome.storage.local.set({ [STORAGE_KEYS.FIRST_LAUNCH]: false });
}

/* ─── Bulk operations ───────────────────────────────────────────────────── */

async function storageAll_export() {
  return new Promise(resolve => chrome.storage.local.get(null, resolve));
}

async function storageAll_import(data) {
  await chrome.storage.local.clear();
  return chrome.storage.local.set(data);
}

async function storageAll_reset() {
  return chrome.storage.local.clear();
}
