const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact age of a timestamp: "just now", "5m ago", "2h ago", "3d ago", then a short date. */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  const elapsed = Math.max(0, now - time);
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 28 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  return new Date(time).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(new Date(time).getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }),
  });
}
