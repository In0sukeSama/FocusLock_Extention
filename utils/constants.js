/**
 * FocusLock — Shared Constants
 * Used across background, popup, and utility modules.
 */

const STORAGE_KEYS = {
  SITES:               'fl_sites',
  USAGE:               'fl_usage',
  SETTINGS:            'fl_settings',
  PROTECTION_ENABLED:  'fl_protection',
  PAUSE_UNTIL:         'fl_pause_until',
  STREAKS:             'fl_streaks',
  FIRST_LAUNCH:        'fl_first_launch',
  NOTIFIED:            'fl_notified',
};

const DEFAULT_SETTINGS = {
  darkMode:       false,
  notifications:  true,
  sound:          false,
  autoStart:      true,
};

// Warning thresholds in seconds — fires a notification at each mark
const NOTIFICATION_THRESHOLDS = [300, 120, 60]; // 5 min, 2 min, 1 min

const DAYS_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const COLORS = {
  primary:  '#7C3AED',
  accent:   '#3B82F6',
  success:  '#10B981',
  warning:  '#F59E0B',
  danger:   '#EF4444',
};
