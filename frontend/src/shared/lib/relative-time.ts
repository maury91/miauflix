import { t } from '@shared/i18n';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact age of a timestamp: "just now", "5m ago", "2h ago", "3d ago", then a short date. */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  const elapsed = Math.max(0, now - time);
  if (elapsed < MINUTE) return t('notifications.justNow');
  if (elapsed < HOUR) return t('notifications.minutesAgo', { count: Math.floor(elapsed / MINUTE) });
  if (elapsed < DAY) return t('notifications.hoursAgo', { count: Math.floor(elapsed / HOUR) });
  if (elapsed < 28 * DAY) return t('notifications.daysAgo', { count: Math.floor(elapsed / DAY) });
  return new Date(time).toLocaleDateString(t('meta.locale'), {
    day: 'numeric',
    month: 'short',
    ...(new Date(time).getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }),
  });
}
