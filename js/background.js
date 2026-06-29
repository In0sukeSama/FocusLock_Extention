/**
 * FocusLock — Background Service Worker
 *
 * Responsibilities:
 *  - Receive second-by-second heartbeats from content.js
 *  - Increment per-domain usage in storage
 *  - Decide when a site should be blocked
 *  - Fire warning / blocked notifications
 *  - Handle daily midnight reset via chrome.alarms
 *  - Respond to popup data requests
 */

// ─── Load shared modules (importScripts works in MV3 service workers) ────────
importScripts(
  '../utils/constants.js',
  '../utils/helpers.js',
  'storage.js'
);

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    // Keep firstLaunch = true so popup shows welcome screen
    await chrome.storage.local.set({ [STORAGE_KEYS.FIRST_LAUNCH]: true });
  }
  scheduleAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarms();
});

// ─── Alarms — daily reset at midnight ────────────────────────────────────────

function scheduleAlarms() {
  // Using a named alarm; Chrome fires it when the time arrives.
  chrome.alarms.create('fl_midnight_reset', {
    when:            Date.now() + msUntilMidnight(),
    periodInMinutes: 24 * 60,
  });
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'fl_midnight_reset') {
    // Usage auto-resets via a new date key — no data deletion needed.
    // Update streaks and reschedule.
    await tickStreaks();
    scheduleAlarms();
  }
});

// ─── Streak tracking ──────────────────────────────────────────────────────────

async function tickStreaks() {
  const streaks = await storageStreaks_get();
  const today   = getTodayKey();
  if (streaks.lastDate === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;

  if (streaks.lastDate === yKey) {
    streaks.current += 1;
  } else if (streaks.lastDate !== today) {
    streaks.current = 1; // broke the streak
  }

  streaks.longest  = Math.max(streaks.longest, streaks.current);
  streaks.lastDate = today;
  await storageStreaks_set(streaks);
}

// ─── Message bus ─────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'HEARTBEAT':
      handleHeartbeat(msg, sender).then(sendResponse);
      return true;

    case 'GET_ALL_DATA':
      getAllData().then(sendResponse);
      return true;

    case 'SITE_ADD':
      handleSiteAdd(msg.site).then(sendResponse);
      return true;

    case 'SITE_UPDATE':
      handleSiteUpdate(msg.site).then(sendResponse);
      return true;

    case 'SITE_DELETE':
      handleSiteDelete(msg.id).then(sendResponse);
      return true;

    case 'SITE_TOGGLE':
      handleSiteToggle(msg.id, msg.enabled).then(sendResponse);
      return true;

    case 'PROTECTION_SET':
      storageProtection_set(msg.enabled).then(() => sendResponse({ ok: true }));
      return true;

    case 'PAUSE_SET':
      storagePause_set(msg.untilMs).then(() => sendResponse({ ok: true }));
      return true;

    case 'PAUSE_CLEAR':
      storagePause_clear().then(() => sendResponse({ ok: true }));
      return true;

    case 'SETTINGS_UPDATE':
      storageSettings_update(msg.patch).then(sendResponse);
      return true;

    case 'DATA_RESET':
      storageAll_reset().then(() => sendResponse({ ok: true }));
      return true;

    case 'DATA_EXPORT':
      storageAll_export().then(sendResponse);
      return true;

    case 'DATA_IMPORT':
      storageAll_import(msg.data).then(() => sendResponse({ ok: true }));
      return true;

    default:
      sendResponse({ error: 'unknown_message_type' });
  }
});

// ─── Heartbeat handler ────────────────────────────────────────────────────────

/**
 * Called once per second from content.js.
 * Returns { blocked: bool, remaining?: number, used?: number, limit?: number }
 */
async function handleHeartbeat({ domain, visible }, _sender) {
  if (!visible || !domain) return { blocked: false };

  // Is protection globally enabled?
  const protectionEnabled = await storageProtection_get();
  if (!protectionEnabled) return { blocked: false };

  // Is protection paused?
  const pauseUntil = await storagePause_getUntil();
  if (pauseUntil && Date.now() < pauseUntil) return { blocked: false };

  // Look up whether this domain is tracked
  const sites     = await storageSites_get();
  const dayOfWeek = getCurrentDay();
  const site      = sites.find(s =>
    isSiteActiveToday(s, dayOfWeek) &&
    (domain === s.domain || domain.endsWith('.' + s.domain))
  );

  if (!site) return { blocked: false };

  // Increment usage by 1 second
  const used      = await storageUsage_increment(site.domain, 1);
  const remaining = Math.max(0, site.dailyLimit - used);

  // Over the limit → block
  if (used >= site.dailyLimit) {
    await maybeNotify(site.domain, 'blocked', `Your daily limit for ${site.domain} has been reached.`, '⛔ Time\'s up!');
    return { blocked: true, domain: site.domain };
  }

  // Warning notifications
  for (const threshold of NOTIFICATION_THRESHOLDS) {
    if (remaining <= threshold && remaining > threshold - 2) {
      const mins = Math.floor(threshold / 60);
      await maybeNotify(
        site.domain,
        `warn_${threshold}`,
        `${mins} minute${mins !== 1 ? 's' : ''} remaining on ${site.domain}`,
        '⏱ FocusLock reminder'
      );
    }
  }

  return { blocked: false, remaining, used, limit: site.dailyLimit };
}

// ─── Notification helper ──────────────────────────────────────────────────────

async function maybeNotify(domain, marker, message, title) {
  const settings = await storageSettings_get();
  if (!settings.notifications) return;

  const alreadySent = await storageNotified_has(domain, marker);
  if (alreadySent) return;

  await storageNotified_mark(domain, marker);
  chrome.notifications.create(`fl_${domain}_${marker}`, {
    type:     'basic',
    iconUrl:  chrome.runtime.getURL('assets/icons/icon48.png'),
    title,
    message,
    priority: 2,
  });
}

// ─── Site CRUD handlers ───────────────────────────────────────────────────────

async function handleSiteAdd(site) {
  const sites = await storageSites_get();
  sites.push(site);
  await storageSites_set(sites);
  return { ok: true };
}

async function handleSiteUpdate(updated) {
  const sites = await storageSites_get();
  const idx   = sites.findIndex(s => s.id === updated.id);
  if (idx !== -1) sites[idx] = updated;
  await storageSites_set(sites);
  return { ok: true };
}

async function handleSiteDelete(id) {
  const sites = await storageSites_get();
  await storageSites_set(sites.filter(s => s.id !== id));
  return { ok: true };
}

async function handleSiteToggle(id, enabled) {
  const sites = await storageSites_get();
  const site  = sites.find(s => s.id === id);
  if (site) site.enabled = enabled;
  await storageSites_set(sites);
  return { ok: true };
}

// ─── getAllData — used by popup on open ───────────────────────────────────────

async function getAllData() {
  const [sites, todayUsage, weeklyUsage, settings, protectionEnabled, pauseUntil, streaks, firstLaunch] =
    await Promise.all([
      storageSites_get(),
      storageUsage_getToday(),
      storageUsage_getWeekly(),
      storageSettings_get(),
      storageProtection_get(),
      storagePause_getUntil(),
      storageStreaks_get(),
      storageFirstLaunch_get(),
    ]);

  return {
    sites,
    todayUsage,
    weeklyUsage,
    settings,
    protectionEnabled,
    pauseUntil,
    streaks,
    firstLaunch,
  };
}
