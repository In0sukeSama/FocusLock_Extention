/**
 * FocusLock — Content Script
 *
 * Runs at document_start in every http/https frame.
 * Sends a 1-second heartbeat to the background service worker
 * only while the page is visible and the tab is active.
 * On a blocked response it immediately redirects to the block page.
 */

(function () {
  'use strict';

  // Don't run inside iframes or the extension's own pages
  if (window.self !== window.top) return;
  if (!location.hostname) return;

  const domain = location.hostname.replace(/^www\./, '');

  let heartbeatTimer = null;
  let isRedirecting  = false;

  // ─── Visibility ────────────────────────────────────────────────────────────

  function isVisible() {
    return document.visibilityState === 'visible';
  }

  // ─── Heartbeat ─────────────────────────────────────────────────────────────

  async function beat() {
    if (isRedirecting) return;

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type:    'HEARTBEAT',
        domain,
        visible: isVisible(),
      });
    } catch {
      // Extension context invalidated (e.g. after update) — stop silently.
      stopHeartbeat();
      return;
    }

    if (response?.blocked) {
      isRedirecting = true;
      stopHeartbeat();
      redirectToBlockPage(response.domain || domain);
    }
  }

  function startHeartbeat() {
    if (heartbeatTimer !== null) return;
    heartbeatTimer = setInterval(beat, 1000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // ─── Redirect ──────────────────────────────────────────────────────────────

  function redirectToBlockPage(blockedDomain) {
    const base   = chrome.runtime.getURL('pages/blocked.html');
    const params = new URLSearchParams({
      domain: blockedDomain,
      from:   location.href,
    });
    location.replace(`${base}?${params.toString()}`);
  }

  // ─── Visibility change ─────────────────────────────────────────────────────

  document.addEventListener('visibilitychange', () => {
    if (!isRedirecting) {
      // Heartbeat continues but beat() checks visibility internally
      if (isVisible()) startHeartbeat();
    }
  });

  // ─── Boot ──────────────────────────────────────────────────────────────────

  startHeartbeat();

})();
