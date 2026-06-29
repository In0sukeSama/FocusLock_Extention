/**
 * FocusLock — Popup Script
 *
 * Manages all popup UI: dashboard, insights, settings, modals.
 * Reads/writes state exclusively by messaging the background service worker.
 */

/* ─── App State ─────────────────────────────────────────────────────────── */

const state = {
  sites:             [],
  todayUsage:        {},
  weeklyUsage:       {},
  settings:          {},
  protectionEnabled: true,
  pauseUntil:        0,
  streaks:           { current: 0, longest: 0 },
  searchQuery:       '',
  editingId:         null,     // ID of site being edited (null = new site)
  selectedDays:      [0,1,2,3,4,5,6],
};

/* ─── DOM references ─────────────────────────────────────────────────────── */

const $ = id => document.getElementById(id);

const els = {
  welcomeOverlay:    $('welcomeOverlay'),
  welcomeGetStarted: $('welcomeGetStarted'),

  // Status card
  statusCard:        $('statusCard'),
  statusTitle:       $('statusTitle'),
  statusSub:         $('statusSub'),
  statusIcon:        $('statusIcon'),
  statusIconWrap:    $('statusIconWrap'),
  protectionToggle:  $('protectionToggle'),

  // Sites
  sitesList:         $('sitesList'),
  emptyState:        $('emptyState'),
  siteSearch:        $('siteSearch'),
  addSiteBtn:        $('addSiteBtn'),

  // Usage card
  totalUsageTime:    $('totalUsageTime'),
  totalUsageOf:      $('totalUsageOf'),
  totalProgressBar:  $('totalProgressBar'),
  totalProgressLabel:$('totalProgressLabel'),

  // Action buttons
  pauseBtn:          $('pauseBtn'),
  stopBtn:           $('stopBtn'),

  // Nav
  navDashboard:      $('navDashboard'),
  navInsights:       $('navInsights'),
  navSettings:       $('navSettings'),

  // Views
  viewDashboard:     $('viewDashboard'),
  viewInsights:      $('viewInsights'),
  viewSettings:      $('viewSettings'),

  // Site modal
  siteModal:         $('siteModal'),
  siteModalTitle:    $('siteModalTitle'),
  closeSiteModal:    $('closeSiteModal'),
  cancelSiteModal:   $('cancelSiteModal'),
  saveSite:          $('saveSite'),
  siteUrl:           $('siteUrl'),
  siteUrlError:      $('siteUrlError'),
  siteHours:         $('siteHours'),
  siteMins:          $('siteMins'),
  siteTimeError:     $('siteTimeError'),
  daysRow:           $('daysRow'),
  daysGroup:         $('daysGroup'),
  alwaysActive:      $('alwaysActive'),

  // Pause modal
  pauseModal:        $('pauseModal'),
  closePauseModal:   $('closePauseModal'),

  // Insights
  statToday:         $('statToday'),
  statWeekly:        $('statWeekly'),
  statStreak:        $('statStreak'),
  statBestStreak:    $('statBestStreak'),
  weekBars:          $('weekBars'),
  breakdownList:     $('breakdownList'),

  // Settings
  settingDarkMode:   $('settingDarkMode'),
  settingNotifications: $('settingNotifications'),
  settingAutoStart:  $('settingAutoStart'),
  exportDataBtn:     $('exportDataBtn'),
  importDataBtn:     $('importDataBtn'),
  importFileInput:   $('importFileInput'),
  resetDataBtn:      $('resetDataBtn'),
  settingsHeaderBtn: $('settingsHeaderBtn'),
  helpBtn:           $('helpBtn'),
};

/* ─── Message helpers ────────────────────────────────────────────────────── */

function msg(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

/* ─── Init ───────────────────────────────────────────────────────────────── */

async function init() {
  const data = await msg('GET_ALL_DATA');
  Object.assign(state, data);

  // Apply dark mode before first render
  if (state.settings.darkMode) document.body.classList.add('dark');

  if (data.firstLaunch) {
    showWelcome();
  }

  renderDashboard();
  renderInsights();
  renderSettings();
  bindEvents();
}

/* ─── Welcome ────────────────────────────────────────────────────────────── */

function showWelcome() {
  els.welcomeOverlay.classList.remove('hidden');
}

function hideWelcome() {
  els.welcomeOverlay.classList.add('hidden');
  // Mark first launch done via storage directly
  chrome.storage.local.set({ [STORAGE_KEYS.FIRST_LAUNCH]: false });
}

/* ─── Event Bindings ─────────────────────────────────────────────────────── */

function bindEvents() {
  // Welcome
  els.welcomeGetStarted.addEventListener('click', hideWelcome);

  // Navigation
  [els.navDashboard, els.navInsights, els.navSettings].forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Header shortcut to settings
  els.settingsHeaderBtn.addEventListener('click', () => switchView('settings'));
  els.helpBtn.addEventListener('click', showHelp);

  // Protection toggle
  els.protectionToggle.addEventListener('change', async e => {
    const enabled = e.target.checked;
    state.protectionEnabled = enabled;
    if (enabled) {
      await msg('PAUSE_CLEAR');
      state.pauseUntil = 0;
    }
    await msg('PROTECTION_SET', { enabled });
    updateStatusCard();
    updateActionButtons();
  });

  // Pause button
  els.pauseBtn.addEventListener('click', () => {
    if (state.pauseUntil && Date.now() < state.pauseUntil) {
      // Resume immediately
      resumeProtection();
    } else {
      openPauseModal();
    }
  });

  // Stop button
  els.stopBtn.addEventListener('click', async () => {
    const turnOn = !state.protectionEnabled;
    state.protectionEnabled = turnOn;
    els.protectionToggle.checked = turnOn;
    if (turnOn) state.pauseUntil = 0;
    await msg('PROTECTION_SET', { enabled: turnOn });
    updateStatusCard();
    updateActionButtons();
  });

  // Add site
  els.addSiteBtn.addEventListener('click', () => openSiteModal(null));

  // Search
  els.siteSearch.addEventListener('input', e => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    renderSitesList();
  });

  // Site modal
  els.closeSiteModal.addEventListener('click', closeSiteModal);
  els.cancelSiteModal.addEventListener('click', closeSiteModal);
  els.siteModal.addEventListener('click', e => { if (e.target === els.siteModal) closeSiteModal(); });
  els.saveSite.addEventListener('click', saveSite);
  els.alwaysActive.addEventListener('change', e => {
    els.daysGroup.style.opacity = e.target.checked ? '.4' : '1';
    els.daysGroup.style.pointerEvents = e.target.checked ? 'none' : 'auto';
  });

  // Day chips
  els.daysRow.addEventListener('click', e => {
    const chip = e.target.closest('.day-chip');
    if (!chip) return;
    const day = parseInt(chip.dataset.day);
    if (state.selectedDays.includes(day)) {
      state.selectedDays = state.selectedDays.filter(d => d !== day);
    } else {
      state.selectedDays = [...state.selectedDays, day].sort();
    }
    renderDayChips();
  });

  // Pause modal
  els.closePauseModal.addEventListener('click', closePauseModal);
  els.pauseModal.addEventListener('click', e => { if (e.target === els.pauseModal) closePauseModal(); });
  document.querySelectorAll('.pause-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mins = parseInt(btn.dataset.mins);
      activatePause(mins);
    });
  });

  // Settings toggles
  els.settingDarkMode.addEventListener('change', e => {
    const dark = e.target.checked;
    document.body.classList.toggle('dark', dark);
    saveSettings({ darkMode: dark });
  });

  els.settingNotifications.addEventListener('change', e => saveSettings({ notifications: e.target.checked }));
  els.settingAutoStart.addEventListener('change', e => saveSettings({ autoStart: e.target.checked }));

  // Data management
  els.exportDataBtn.addEventListener('click', exportData);
  els.importDataBtn.addEventListener('click', () => els.importFileInput.click());
  els.importFileInput.addEventListener('change', importData);
  els.resetDataBtn.addEventListener('click', resetData);

  // Poll every 5 seconds to refresh usage while popup is open
  setInterval(refreshUsage, 5000);
}

/* ─── View switching ─────────────────────────────────────────────────────── */

function switchView(view) {
  ['dashboard', 'insights', 'settings'].forEach(v => {
    $(`view${capitalize(v)}`).classList.toggle('active', v === view);
    $(`nav${capitalize(v)}`).classList.toggle('active', v === view);
  });

  if (view === 'insights') renderInsights();
}

function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

/* ─── Dashboard rendering ────────────────────────────────────────────────── */

function renderDashboard() {
  updateStatusCard();
  renderSitesList();
  renderUsageCard();
  updateActionButtons();
}

function updateStatusCard() {
  const isPaused = state.pauseUntil && Date.now() < state.pauseUntil;
  const isOn     = state.protectionEnabled && !isPaused;

  els.statusCard.className   = 'status-card' + (isPaused ? ' paused' : (!state.protectionEnabled ? ' off' : ''));
  els.protectionToggle.checked = state.protectionEnabled;

  if (isPaused) {
    els.statusTitle.textContent = 'Protection Paused';
    const minsLeft = Math.ceil((state.pauseUntil - Date.now()) / 60000);
    els.statusSub.textContent   = `Resumes in ${minsLeft} minute${minsLeft !== 1 ? 's' : ''}`;
    els.statusIcon.innerHTML    = '<circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/>';
  } else if (!state.protectionEnabled) {
    els.statusTitle.textContent = 'Protection is OFF';
    els.statusSub.textContent   = 'Sites are not being tracked';
    els.statusIcon.innerHTML    = '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>';
  } else {
    els.statusTitle.textContent = 'Protection is ON';
    els.statusSub.textContent   = "You're protected from distractions";
    els.statusIcon.innerHTML    = '<path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" fill="currentColor" opacity=".15"/><path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"/><polyline points="9 12 11 14 15 10"/>';
  }
}

function updateActionButtons() {
  const isPaused = state.pauseUntil && Date.now() < state.pauseUntil;

  // Pause button
  els.pauseBtn.classList.toggle('active', !!isPaused);
  els.pauseBtn.innerHTML = isPaused
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Resume`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause Protection`;

  // Stop/Start button
  if (state.protectionEnabled) {
    els.stopBtn.className = 'action-btn stop';
    els.stopBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Stop Protection`;
  } else {
    els.stopBtn.className = 'action-btn stop off';
    els.stopBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start Protection`;
  }
}

function renderSitesList() {
  const filtered = state.sites.filter(s =>
    !state.searchQuery || s.domain.includes(state.searchQuery)
  );

  els.emptyState.classList.toggle('hidden', filtered.length > 0 || state.searchQuery);

  if (filtered.length === 0 && state.searchQuery) {
    els.sitesList.innerHTML = `<div class="empty-state" style="padding:20px 0">
      <p style="font-size:13px;color:var(--text-3)">No sites match "<strong>${state.searchQuery}</strong>"</p>
    </div>`;
    return;
  }

  els.sitesList.innerHTML = filtered.map(site => buildSiteCard(site)).join('');

  // Bind per-card actions
  els.sitesList.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const { action, id } = el.dataset;
      if (action === 'edit')   openSiteModal(id);
      if (action === 'delete') confirmDeleteSite(id);
      if (action === 'toggle') toggleSiteEnabled(id);
    });
  });
}

function buildSiteCard(site) {
  const used      = state.todayUsage[site.domain] || 0;
  const pct       = site.dailyLimit > 0 ? clamp(Math.round((used / site.dailyLimit) * 100), 0, 100) : 0;
  const isBlocked = used >= site.dailyLimit && site.dailyLimit > 0;
  const isWarn    = pct >= 80 && !isBlocked;
  const fillClass = isBlocked ? 'blocked' : isWarn ? 'warn' : '';

  const cardClass = [
    'site-card',
    !site.enabled ? 'disabled' : '',
    isBlocked     ? 'blocked-now' : '',
  ].filter(Boolean).join(' ');

  return `
    <div class="${cardClass}" data-id="${site.id}">
      <div class="favicon-wrap">
        <img src="${getFaviconUrl(site.domain)}"
             alt=""
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <span class="favicon-fallback" style="display:none">${site.domain.charAt(0).toUpperCase()}</span>
      </div>
      <div class="site-info">
        <div class="site-domain">${site.domain}</div>
        <div class="site-meta">
          <span class="budget-label">${formatTimeShort(site.dailyLimit)} budget</span>
          <span class="usage-text">${formatTimeShort(used)} used</span>
          ${isBlocked ? '<span class="badge badge-red" style="font-size:10px;">Blocked</span>' : ''}
        </div>
        <div class="site-progress-bar-wrap">
          <div class="site-progress-bar-fill ${fillClass}" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="site-actions">
        <button class="site-action-btn" data-action="toggle" data-id="${site.id}" title="${site.enabled ? 'Disable' : 'Enable'}">
          ${site.enabled
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'}
        </button>
        <button class="site-action-btn" data-action="edit" data-id="${site.id}" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="site-action-btn delete" data-action="delete" data-id="${site.id}" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>`;
}

function renderUsageCard() {
  const totalUsed  = Object.values(state.todayUsage).reduce((a, b) => a + b, 0);
  const totalLimit = state.sites
    .filter(s => s.enabled)
    .reduce((a, s) => a + s.dailyLimit, 0);

  const pct = totalLimit > 0 ? clamp(Math.round((totalUsed / totalLimit) * 100), 0, 100) : 0;
  const fillClass = pct >= 100 ? 'blocked' : pct >= 80 ? 'warn' : '';

  els.totalUsageTime.textContent    = formatTimeShort(totalUsed) || '0m';
  els.totalUsageOf.textContent      = `of ${formatTimeShort(totalLimit) || '0m'} limit`;
  els.totalProgressBar.style.width  = `${pct}%`;
  els.totalProgressBar.className    = `progress-bar-fill ${fillClass}`;
  els.totalProgressLabel.textContent= `${pct}% of daily limit used`;
}

/* ─── Site Modal ─────────────────────────────────────────────────────────── */

function openSiteModal(editId) {
  state.editingId = editId;
  clearModalErrors();

  if (editId) {
    const site = state.sites.find(s => s.id === editId);
    if (!site) return;
    els.siteModalTitle.textContent = 'Edit Site';
    els.siteUrl.value              = site.domain;
    els.siteUrl.disabled           = true;
    els.siteHours.value            = Math.floor(site.dailyLimit / 3600);
    els.siteMins.value             = Math.floor((site.dailyLimit % 3600) / 60);
    els.alwaysActive.checked       = site.alwaysActive;
    state.selectedDays             = [...(site.daysActive || [0,1,2,3,4,5,6])];
  } else {
    els.siteModalTitle.textContent = 'Add Site';
    els.siteUrl.value              = '';
    els.siteUrl.disabled           = false;
    els.siteHours.value            = 0;
    els.siteMins.value             = 30;
    els.alwaysActive.checked       = true;
    state.selectedDays             = [0,1,2,3,4,5,6];
  }

  updateDaysGroupVisibility();
  renderDayChips();
  els.siteModal.classList.add('open');
  if (!editId) setTimeout(() => els.siteUrl.focus(), 50);
}

function closeSiteModal() {
  els.siteModal.classList.remove('open');
  els.siteUrl.disabled = false;
  state.editingId = null;
}

function renderDayChips() {
  els.daysRow.querySelectorAll('.day-chip').forEach(chip => {
    const day = parseInt(chip.dataset.day);
    chip.classList.toggle('selected', state.selectedDays.includes(day));
  });
}

function updateDaysGroupVisibility() {
  const always = els.alwaysActive.checked;
  els.daysGroup.style.opacity       = always ? '.4' : '1';
  els.daysGroup.style.pointerEvents = always ? 'none' : 'auto';
}

function clearModalErrors() {
  els.siteUrlError.classList.remove('show');
  els.siteUrl.classList.remove('error');
  els.siteTimeError.classList.remove('show');
  els.siteHours.classList.remove('error');
  els.siteMins.classList.remove('error');
}

async function saveSite() {
  clearModalErrors();
  let valid = true;

  // Validate domain
  let domain = els.siteUrl.value.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    els.siteUrlError.classList.add('show');
    els.siteUrl.classList.add('error');
    valid = false;
  }

  // Validate time
  const hours = parseInt(els.siteHours.value) || 0;
  const mins  = parseInt(els.siteMins.value)  || 0;
  const limitSecs = hours * 3600 + mins * 60;
  if (limitSecs < 60) {
    els.siteTimeError.classList.add('show');
    els.siteMins.classList.add('error');
    valid = false;
  }

  // Duplicate check (new sites only)
  if (!state.editingId && state.sites.some(s => s.domain === domain)) {
    els.siteUrlError.textContent = `${domain} is already in your list.`;
    els.siteUrlError.classList.add('show');
    els.siteUrl.classList.add('error');
    valid = false;
  }

  if (!valid) return;

  const alwaysActive = els.alwaysActive.checked;
  const daysActive   = alwaysActive ? [0,1,2,3,4,5,6] : state.selectedDays;

  if (state.editingId) {
    const site = state.sites.find(s => s.id === state.editingId);
    Object.assign(site, { dailyLimit: limitSecs, alwaysActive, daysActive });
    await msg('SITE_UPDATE', { site });
  } else {
    const site = {
      id:          generateId(),
      domain,
      dailyLimit:  limitSecs,
      alwaysActive,
      daysActive,
      enabled:     true,
      createdAt:   Date.now(),
    };
    state.sites.push(site);
    await msg('SITE_ADD', { site });
  }

  closeSiteModal();
  renderSitesList();
  renderUsageCard();
  if ($('viewInsights').classList.contains('active')) renderInsights();
}

/* ─── Site management actions ────────────────────────────────────────────── */

async function confirmDeleteSite(id) {
  const site = state.sites.find(s => s.id === id);
  if (!site) return;
  if (!confirm(`Remove ${site.domain} from FocusLock?`)) return;
  state.sites = state.sites.filter(s => s.id !== id);
  await msg('SITE_DELETE', { id });
  renderSitesList();
  renderUsageCard();
}

async function toggleSiteEnabled(id) {
  const site = state.sites.find(s => s.id === id);
  if (!site) return;
  site.enabled = !site.enabled;
  await msg('SITE_TOGGLE', { id, enabled: site.enabled });
  renderSitesList();
}

/* ─── Pause management ───────────────────────────────────────────────────── */

function openPauseModal() {
  els.pauseModal.classList.add('open');
}

function closePauseModal() {
  els.pauseModal.classList.remove('open');
}

async function activatePause(minutes) {
  const untilMs = Date.now() + minutes * 60 * 1000;
  state.pauseUntil = untilMs;
  await msg('PAUSE_SET', { untilMs });
  closePauseModal();
  updateStatusCard();
  updateActionButtons();
}

async function resumeProtection() {
  state.pauseUntil = 0;
  await msg('PAUSE_CLEAR');
  updateStatusCard();
  updateActionButtons();
}

/* ─── Insights ───────────────────────────────────────────────────────────── */

function renderInsights() {
  // Today total
  const todayTotal = Object.values(state.todayUsage).reduce((a,b) => a+b, 0);
  els.statToday.textContent = formatTimeShort(todayTotal) || '0m';

  // Weekly total
  const weeklyTotal = Object.values(state.weeklyUsage).reduce((dayTotal, domains) => {
    return dayTotal + Object.values(domains).reduce((a,b)=>a+b, 0);
  }, 0);
  els.statWeekly.textContent = formatTimeShort(weeklyTotal) || '0m';

  // Streaks
  els.statStreak.textContent     = state.streaks.current  || 0;
  els.statBestStreak.textContent = state.streaks.longest  || 0;

  // Weekly bar chart
  renderWeekBars();

  // Site breakdown
  renderBreakdown();
}

function renderWeekBars() {
  const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const sortedDays = Object.entries(state.weeklyUsage).sort(([a],[b]) => a.localeCompare(b));
  const todayKey   = getTodayKey();

  const maxSecs = Math.max(1, ...sortedDays.map(([,domains]) =>
    Object.values(domains).reduce((a,b)=>a+b, 0)
  ));

  els.weekBars.innerHTML = sortedDays.map(([dateKey, domains]) => {
    const total = Object.values(domains).reduce((a,b)=>a+b, 0);
    const pct   = Math.round((total / maxSecs) * 100);
    const d     = new Date(dateKey + 'T00:00:00');
    const label = DAYS_SHORT[d.getDay()];
    const isToday = dateKey === todayKey;

    return `
      <div class="week-bar-col">
        <div class="week-bar-outer" title="${formatTimeShort(total)}">
          <div class="week-bar-inner ${isToday ? 'today' : ''}" style="height:${pct}%"></div>
        </div>
        <span class="week-bar-label" style="${isToday ? 'color:var(--c-blue);font-weight:700' : ''}">${label}</span>
      </div>`;
  }).join('');
}

function renderBreakdown() {
  const sorted = Object.entries(state.todayUsage).sort(([,a],[,b]) => b - a);

  if (sorted.length === 0) {
    els.breakdownList.innerHTML = `<div style="padding:16px 14px;text-align:center;font-size:12.5px;color:var(--text-3)">No usage recorded today.</div>`;
    return;
  }

  els.breakdownList.innerHTML = sorted.map(([domain, secs]) => `
    <div class="breakdown-row">
      <div class="breakdown-favicon">
        <img src="${getFaviconUrl(domain)}" alt="" onerror="this.parentElement.innerHTML='<span style=font-size:11px;font-weight:700;color:var(--text-3);display:flex;align-items:center;justify-content:center;height:100%>${domain.charAt(0).toUpperCase()}</span>'">
      </div>
      <span class="breakdown-domain">${domain}</span>
      <span class="breakdown-time">${formatTimeShort(secs)}</span>
    </div>`).join('');
}

/* ─── Settings ───────────────────────────────────────────────────────────── */

function renderSettings() {
  els.settingDarkMode.checked       = !!state.settings.darkMode;
  els.settingNotifications.checked  = state.settings.notifications !== false;
  els.settingAutoStart.checked      = state.settings.autoStart !== false;
}

async function saveSettings(patch) {
  Object.assign(state.settings, patch);
  await msg('SETTINGS_UPDATE', { patch });
}

function showHelp() {
  alert('FocusLock v1.0\n\nAdd sites → set a daily budget → FocusLock tracks active browsing time and blocks access when the budget runs out.\n\nBudgets reset automatically at midnight.');
}

/* ─── Data import / export ───────────────────────────────────────────────── */

async function exportData() {
  const data = await msg('DATA_EXPORT');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `focuslock-backup-${getTodayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    if (!confirm('This will replace all your current FocusLock data. Continue?')) return;
    await msg('DATA_IMPORT', { data });
    location.reload();
  } catch {
    alert('Invalid backup file.');
  }
  e.target.value = '';
}

async function resetData() {
  if (!confirm('Reset ALL FocusLock data? This cannot be undone.')) return;
  await msg('DATA_RESET');
  location.reload();
}

/* ─── Background refresh ─────────────────────────────────────────────────── */

async function refreshUsage() {
  const data = await msg('GET_ALL_DATA');
  state.todayUsage  = data.todayUsage;
  state.weeklyUsage = data.weeklyUsage;
  state.streaks     = data.streaks;
  state.pauseUntil  = data.pauseUntil;
  renderSitesList();
  renderUsageCard();
  updateStatusCard();
  updateActionButtons();
}

/* ─── Utility ────────────────────────────────────────────────────────────── */

// clamp is defined in helpers.js; getFaviconUrl, formatTimeShort, generateId,
// getTodayKey too — all loaded via <script> tags before this file.

/* ─── Boot ───────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', init);
