import { playableKey } from '@routes/playable.types';
import type { ProgressEntry } from '@routes/progress.types';

/** Local wins ties. Never write imported progress back to Trakt. */
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
