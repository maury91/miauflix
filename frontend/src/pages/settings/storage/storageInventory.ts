import type { StorageInventoryResponse, StorageItemView } from '@miauflix/backend';
import { t, type Translate } from '@shared/i18n';

export type UsageCategory = 'movie' | 'episode' | 'anime' | 'unknown' | 'remux' | 'other';

/** One kind of used space; its label is translated where it is shown (`categoryLabel`). */
export interface UsageSegment {
  category: UsageCategory;
  bytes: number;
}

export interface StorageUsage {
  /** What the bar spans: the disk, or Miauflix's limit when the disk's size is unknown. */
  totalBytes: number;
  /** Whether `totalBytes` is the disk's size. */
  isDisk: boolean;
  /** Used space, in the bar's order; empty categories left out. */
  segments: UsageSegment[];
  /**
   * Used space: the disk's, or what Miauflix holds when the disk's size is unknown. Null when
   * neither is known (a download's size isn't measured and there are no disk stats).
   */
  usedBytes: number | null;
  freeBytes: number | null;
  /** Miauflix's storage limit, where the bar marks it (null without a limit). */
  limitBytes: number | null;
  /** Whether `limitBytes` is an edit not saved yet. */
  limitDraft: boolean;
  /** The room kept for playback just under the limit (null without a limit or reserve). */
  reserveBytes: number | null;
  /** The most Miauflix could hold: free space plus what it holds now (null without disk stats). */
  capacityBytes: number | null;
  /** What Miauflix counts against its limit (written plus reserved for downloads). */
  chargedBytes: number;
}

/** A usage category's name in the interface language. */
export const categoryLabel = (category: UsageCategory, translate: Translate = t): string =>
  translate(`storage.category.${category}`);

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return t('storage.unavailable');
  }
  if (bytes === 0) return '0 B';

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  const formattedValue = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
    value
  );

  return `${formattedValue} ${units[unitIndex]}`;
}

/** What a download's TV copies take; older backends leave it out. */
export const remuxBytesOf = (item: StorageItemView): number => item.remuxBytes ?? 0;

/** What kind of media a download holds; older backends leave it out. */
export const kindOf = (item: StorageItemView): StorageItemView['kind'] => item.kind ?? 'unknown';

/** The video files a download holds, apart from its TV copies. */
const videoBytes = (item: StorageItemView) =>
  Math.max(0, (item.physicalBytes ?? 0) - remuxBytesOf(item));

/**
 * The disk as the bar shows it: each kind of media Miauflix stored, its TV copies, then whatever
 * else is on the disk (other data) and the free space, with Miauflix's limit marked on it.
 */
/** Settings typed but not saved yet, which the bar shows in place of the saved ones. */
export interface UsageDraft {
  limitBytes: number | null;
  reserveBytes: number | null;
}

export function computeUsage(
  { summary, items }: StorageInventoryResponse,
  draft?: UsageDraft
): StorageUsage {
  const byCategory = new Map<UsageCategory, number>();
  const add = (category: UsageCategory, bytes: number) =>
    byCategory.set(category, (byCategory.get(category) ?? 0) + bytes);
  for (const item of items) {
    add(kindOf(item), videoBytes(item));
    add('remux', remuxBytesOf(item));
  }
  const miauflixBytes = [...byCategory.values()].reduce((sum, bytes) => sum + bytes, 0);
  const { filesystem } = summary;
  if (filesystem) {
    const diskUsed = Math.max(0, filesystem.totalBytes - filesystem.freeBytes);
    // Everything on the disk that isn't Miauflix's: the system, other apps, their files
    add('other', Math.max(0, diskUsed - miauflixBytes));
  }
  const order: UsageCategory[] = ['movie', 'episode', 'anime', 'unknown', 'remux', 'other'];
  const segments = order
    .map(category => ({
      category,
      bytes: byCategory.get(category) ?? 0,
    }))
    .filter(segment => segment.bytes > 0);
  const shownBytes = segments.reduce((sum, segment) => sum + segment.bytes, 0);
  // Without disk stats, a download whose size isn't measured leaves the total unknown, not zero
  const measured = filesystem !== null || items.every(item => item.physicalBytes !== null);
  const usedBytes = measured ? shownBytes : null;
  const savedLimit = summary.storageBudgetBytes > 0 ? summary.storageBudgetBytes : null;
  // A typed 0 is a limit (media-load then keeps nothing); only an unreadable draft falls back
  const draftLimit = draft?.limitBytes ?? null;
  const limitBytes = draftLimit ?? savedLimit;
  const reserveBytes =
    limitBytes !== null && draft?.reserveBytes ? Math.min(draft.reserveBytes, limitBytes) : null;
  // Never 0: a disk reporting no size would otherwise make the shares NaN
  const totalBytes = filesystem
    ? Math.max(filesystem.totalBytes, shownBytes, 1)
    : Math.max(limitBytes ?? 0, shownBytes, 1);
  return {
    totalBytes,
    isDisk: filesystem !== null,
    segments,
    usedBytes,
    freeBytes: filesystem ? filesystem.freeBytes : null,
    limitBytes,
    limitDraft: draftLimit !== null && draftLimit !== savedLimit,
    reserveBytes,
    capacityBytes: filesystem ? filesystem.freeBytes + miauflixBytes : null,
    chargedBytes: summary.chargedBytes,
  };
}

export type StorageSort = 'size' | 'name' | 'type' | 'progress' | 'status';

const SORTS: readonly StorageSort[] = ['size', 'name', 'type', 'progress', 'status'];

/** The sort choices, labelled in the interface language. */
export const sortOptions = (): { value: StorageSort; label: string }[] =>
  SORTS.map(value => ({ value, label: t(`storage.sort.${value}`) }));

const KIND_ORDER: Record<StorageItemView['kind'], number> = {
  movie: 0,
  episode: 1,
  anime: 2,
  unknown: 3,
};
/** Busiest first: what is playing or downloading, then what can still go away. */
const ACTIVITY_ORDER: Record<StorageItemView['activity'], number> = {
  active: 0,
  available_offline: 1,
  inactive: 2,
  local_only: 3,
};

const byName = (a: StorageItemView, b: StorageItemView) =>
  a.title.localeCompare(b.title) || (a.subtitle ?? '').localeCompare(b.subtitle ?? '');
const bySize = (a: StorageItemView, b: StorageItemView) =>
  (b.physicalBytes ?? 0) - (a.physicalBytes ?? 0) || b.reservedBytes - a.reservedBytes;

export function sortItems(items: readonly StorageItemView[], sort: StorageSort) {
  const compare: Record<StorageSort, (a: StorageItemView, b: StorageItemView) => number> = {
    size: (a, b) => bySize(a, b) || byName(a, b),
    name: (a, b) => byName(a, b) || bySize(a, b),
    type: (a, b) => KIND_ORDER[kindOf(a)] - KIND_ORDER[kindOf(b)] || byName(a, b),
    // Least downloaded first: what is still coming
    progress: (a, b) => a.progressPercent - b.progressPercent || byName(a, b),
    status: (a, b) =>
      b.activeStreams - a.activeStreams ||
      ACTIVITY_ORDER[a.activity] - ACTIVITY_ORDER[b.activity] ||
      byName(a, b),
  };
  return [...items].sort(compare[sort]);
}
