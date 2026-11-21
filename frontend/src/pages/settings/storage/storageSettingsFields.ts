import type { ConfigEntryView } from '@miauflix/backend';

/** The configuration group that holds media-load's storage settings. */
export const STORAGE_SETTINGS_GROUP = 'MEDIA_LOAD';

/** Shown first: what decides how much Miauflix keeps and for how long. */
export const MAIN_STORAGE_KEYS = [
  'STORAGE_THRESHOLD',
  'STORAGE_PLAYBACK_RESERVE',
  'CONTENT_SEED_DURATION_SECONDS',
] as const;
/** Behind Advanced: where the files go and how they're written. */
export const ADVANCED_STORAGE_KEYS = [
  'DOWNLOAD_PATH',
  'DOWNLOAD_PATH_EXCLUSIVE',
  'STORAGE_PAD_FILE_SIZES',
] as const;
const STORAGE_KEYS = new Set<string>([...MAIN_STORAGE_KEYS, ...ADVANCED_STORAGE_KEYS]);

const SIZE_UNITS = ['MB', 'GB', 'TB'];
const TIME_UNITS = ['s', 'm', 'h', 'd'];
const SECONDS_PER: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };

/** Labels for people; the Configuration page keeps the keys' own names. */
const LABELS: Record<string, string> = {
  STORAGE_THRESHOLD: 'Storage limit',
  STORAGE_PLAYBACK_RESERVE: 'Reserved for playback',
  CONTENT_SEED_DURATION_SECONDS: 'Seeding after download',
  DOWNLOAD_PATH: 'Download folder',
  DOWNLOAD_PATH_EXCLUSIVE: 'Miauflix owns the download folder',
  STORAGE_PAD_FILE_SIZES: 'Pad file sizes',
};

/** Media-load's storage settings from the full configuration, in the order the page shows them. */
export function storageSettingEntries(entries: ConfigEntryView[]): ConfigEntryView[] {
  const order = [...MAIN_STORAGE_KEYS, ...ADVANCED_STORAGE_KEYS] as readonly string[];
  return entries
    .filter(entry => entry.serviceGroup === STORAGE_SETTINGS_GROUP && STORAGE_KEYS.has(entry.key))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

/**
 * The entry as the Storage page shows it. Media-load publishes its sizes as text and the seeding
 * time in seconds, so they get the size and duration controls here; `toFieldValue` and
 * `fromFieldValue` convert between what is stored and what those controls edit.
 */
export function storageFieldEntry(entry: ConfigEntryView): ConfigEntryView {
  const label = LABELS[entry.key] ?? entry.label;
  if (entry.key === 'STORAGE_THRESHOLD' || entry.key === 'STORAGE_PLAYBACK_RESERVE') {
    return { ...entry, label, inputType: 'size', sizeUnits: SIZE_UNITS };
  }
  if (entry.key === 'CONTENT_SEED_DURATION_SECONDS') {
    return {
      ...entry,
      label,
      // The stored description counts in seconds; this control picks its own unit
      description:
        'How long to keep sharing a download after its video is complete. Set to 0 to stop sharing straight away.',
      inputType: 'time',
      timeUnits: TIME_UNITS,
    };
  }
  return { ...entry, label };
}

/** A stored value as its control edits it: seconds become `1h`, sizes are normalised. */
export function toFieldValue(key: string, stored: string): string {
  const value = stored.trim();
  if (key === 'CONTENT_SEED_DURATION_SECONDS') {
    if (!/^\d+$/.test(value)) return value;
    const seconds = Number(value);
    // The largest unit it's a whole number of; seconds always are
    const unit = [...TIME_UNITS].reverse().find(option => seconds % SECONDS_PER[option]! === 0)!;
    return `${seconds / SECONDS_PER[unit]!}${unit}`;
  }
  if (key === 'STORAGE_THRESHOLD' || key === 'STORAGE_PLAYBACK_RESERVE') {
    return value.replace(/\s+/g, '').toUpperCase();
  }
  return stored;
}

/** What a control edited, in the form media-load stores: `1h` becomes `3600`. */
export function fromFieldValue(key: string, edited: string): string {
  if (key === 'CONTENT_SEED_DURATION_SECONDS') {
    const match = /^(\d+)([smhd])$/.exec(edited.trim());
    return match ? String(Number(match[1]) * SECONDS_PER[match[2]!]!) : edited;
  }
  return edited;
}

const BYTES_PER: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
};

/** A size such as `50GB` in bytes, in binary units as media-load reads it; null if it isn't one. */
export function parseSize(value: string | undefined): number | null {
  const match = /^(\d+)\s*(B|KB|MB|GB|TB)$/i.exec(value?.trim() ?? '');
  return match ? Number(match[1]) * BYTES_PER[match[2]!.toUpperCase()]! : null;
}

/** "1 hour", "30 minutes", "2 days": the seeding time in words, from seconds. */
export function describeDuration(stored: string | undefined): string | null {
  if (!stored || !/^\d+$/.test(stored.trim())) return null;
  const seconds = Number(stored);
  if (seconds === 0) return null;
  const [unit, name] =
    seconds % 86_400 === 0
      ? [86_400, 'day']
      : seconds % 3600 === 0
        ? [3600, 'hour']
        : seconds % 60 === 0
          ? [60, 'minute']
          : [1, 'second'];
  const count = seconds / unit;
  return `${count} ${name}${count === 1 ? '' : 's'}`;
}
