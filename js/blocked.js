/**
 * FocusLock — Blocked Page Script
 *
 * Parses the URL params, loads usage data, renders stats,
 * picks a motivational quote, and runs the midnight countdown.
 */

/* ─── Motivational quotes ────────────────────────────────────────────────── */

const QUOTES = [
  { text: "Almost everything will work again if you unplug it for a few minutes, including you.", author: "Anne Lamott" },
  { text: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs" },
  { text: "The key is not to prioritise what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
  { text: "Concentrate all your thoughts upon the work in hand. The sun's rays do not burn until brought to a focus.", author: "Alexander Graham Bell" },
  { text: "Where focus goes, energy flows.", author: "Tony Robbins" },
  { text: "You don't need more time. You just need to decide.", author: "Seth Godin" },
  { text: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee" },
  { text: "It's not that I'm so smart, it's just that I stay with problems longer.", author: "Albert Einstein" },
  { text: "One reason so few of us achieve what we truly want is that we never direct our focus.", author: "Tony Robbins" },
  { text: "Do one thing at a time, and while doing it put your whole soul into it to the exclusion of all else.", author: "Swami Vivekananda" },
  { text: "The art of being wise is the art of knowing what to overlook.", author: "William James" },
  { text: "You will never reach your destination if you stop and throw stones at every dog that barks.", author: "Winston Churchill" },
];

/* ─── Helpers (also available from helpers.js) ───────────────────────────── */

function secsUntilMidnight() {
  const now      = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.floor((midnight.getTime() - now.getTime()) / 1000);
}

/* ─── Main ───────────────────────────────────────────────────────────────── */

async function init() {
  const params = new URLSearchParams(location.search);
  const domain = params.get('domain') || 'this site';

  // Populate domain UI
  document.getElementById('domainName').textContent   = domain;
  document.getElementById('domainFavicon').src        = getFaviconUrl(domain);
  document.getElementById('domainFavicon').onerror    = function () { this.style.display = 'none'; };

  // Load usage data from storage
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.USAGE,
      STORAGE_KEYS.STREAKS,
    ]);

    const todayKey = getTodayKey();
    const usage    = (result[STORAGE_KEYS.USAGE]   || {})[todayKey]  || {};
    const streaks  = result[STORAGE_KEYS.STREAKS]  || { current: 0 };
    const usedSecs = usage[domain] || 0;

    document.getElementById('timeUsed').textContent   = formatTimeShort(usedSecs) || '0m';
    document.getElementById('streakValue').textContent = streaks.current || 0;
  } catch {
    // Storage not accessible — show placeholders
    document.getElementById('timeUsed').textContent = '—';
  }

  // Random quote
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  document.getElementById('quoteText').textContent   = quote.text;
  document.getElementById('quoteAuthor').textContent = `— ${quote.author}`;

  // Midnight countdown
  updateCountdown();
  setInterval(updateCountdown, 1000);

  // Close tab button
  document.getElementById('closeTabBtn').addEventListener('click', () => {
    window.close();
    // Fallback if window.close() is blocked
    setTimeout(() => {
      document.getElementById('closeTabBtn').textContent = 'Tab closed! (or use Ctrl+W)';
    }, 200);
  });
}

function updateCountdown() {
  const secs = secsUntilMidnight();
  const h    = Math.floor(secs / 3600);
  const m    = Math.floor((secs % 3600) / 60);
  const s    = secs % 60;

  const label = h > 0
    ? `${h}h ${String(m).padStart(2,'0')}m`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  document.getElementById('resetCountdown').textContent = label;
  document.getElementById('resetTime').textContent      = label;
}

document.addEventListener('DOMContentLoaded', init);
