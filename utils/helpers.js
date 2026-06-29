/**
 * FocusLock — Shared Helpers
 * Pure utility functions with no side-effects.
 */

/** Extract bare hostname from a URL, stripping www. */
function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Today's date as YYYY-MM-DD using local time */
function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format seconds as "1h 23m", "45m 10s", or "30s" */
function formatTime(totalSeconds) {
  const s = Math.floor(totalSeconds);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec > 0 ? sec + 's' : ''}`.trim();
}

/** Format seconds as compact "1h 23m" or "45m" */
function formatTimeShort(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Seconds → "HH:MM:SS" countdown string */
function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

/** Generate a short unique ID */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 0-based current day of week (0 = Sunday) */
function getCurrentDay() {
  return new Date().getDay();
}

/** Google favicon CDN URL for a domain */
function getFaviconUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

/** Milliseconds until the next local midnight */
function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

/** Clamp a value between min and max */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/** Check if a site record is active on a given day-of-week */
function isSiteActiveToday(site, dayOfWeek) {
  if (!site.enabled) return false;
  if (site.alwaysActive) return true;
  return Array.isArray(site.daysActive) && site.daysActive.includes(dayOfWeek);
}

/** Return the matching tracked site for a hostname (supports subdomains) */
function matchSiteForDomain(sites, hostname) {
  return sites.find(s =>
    hostname === s.domain || hostname.endsWith('.' + s.domain)
  ) || null;
}
