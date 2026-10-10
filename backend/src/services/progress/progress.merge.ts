import { playableKey } from '@routes/playable.types';
import type { ProgressEntry } from '@routes/progress.types';

/**
 * Return the newest entry per playable, sorted newest first; local entries win timestamp ties.
 * Does not persist or export imported progress.
 */
export function mergeProgress(local: ProgressEntry[], remote: ProgressEntry[]): ProgressEntry[] {
  const latest = new Map<string, ProgressEntry>();
  for (const entry of [...local, ...remote]) {
    const key = playableKey(entry.playable);
    const previous = latest.get(key);
    if (!previous || Date.parse(entry.updatedAt) > Date.parse(previous.updatedAt))
      latest.set(key, entry);
  }
  return [...latest.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
