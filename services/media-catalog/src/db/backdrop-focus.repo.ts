import type { BackdropFocus } from '@miauflix/service-contracts';
import { and, eq } from 'drizzle-orm';

import type { CatalogDatabase } from './database';
import { backdropFocus } from './schema';

export const BACKDROP_FOCUS_ALGORITHM_VERSION = 'subject-prominence-v5';
const FAILURE_RETRY_MS = 60 * 60 * 1000;

export interface BackdropFocusKey {
  provider: string;
  imageKey: string;
}

export class BackdropFocusRepository {
  constructor(private readonly database: CatalogDatabase) {}

  private get db() {
    return this.database.db;
  }

  /**
   * Returns stored focus for the current algorithm, or null for missing, failed, or incomplete rows.
   * Database errors propagate.
   */
  get(key: BackdropFocusKey): BackdropFocus | null {
    const row = this.db
      .select()
      .from(backdropFocus)
      .where(
        and(
          eq(backdropFocus.provider, key.provider),
          eq(backdropFocus.imageKey, key.imageKey),
          eq(backdropFocus.algorithmVersion, BACKDROP_FOCUS_ALGORITHM_VERSION)
        )
      )
      .get();
    if (!row || row.state !== 'ready') return null;
    if (row.focusX === null || row.focusY === null) return null;
    return { x: row.focusX, y: row.focusY };
  }

  /**
   * Allows analysis when the current algorithm has no retry deadline or it has elapsed.
   * Database errors propagate.
   */
  shouldRetry(key: BackdropFocusKey): boolean {
    const row = this.db
      .select({ retryAfter: backdropFocus.retryAfter })
      .from(backdropFocus)
      .where(
        and(
          eq(backdropFocus.provider, key.provider),
          eq(backdropFocus.imageKey, key.imageKey),
          eq(backdropFocus.algorithmVersion, BACKDROP_FOCUS_ALGORITHM_VERSION)
        )
      )
      .get();
    return !row?.retryAfter || row.retryAfter <= Date.now();
  }

  /**
   * Stores focus for the current algorithm and clears any failure and retry deadline.
   * Coordinates must already be normalized and validated; database errors propagate.
   */
  saveSuccess(key: BackdropFocusKey, focus: BackdropFocus): void {
    this.db
      .insert(backdropFocus)
      .values({
        ...key,
        algorithmVersion: BACKDROP_FOCUS_ALGORITHM_VERSION,
        state: 'ready',
        focusX: focus.x,
        focusY: focus.y,
        analyzedAt: Date.now(),
        retryAfter: null,
        errorCode: null,
      })
      .onConflictDoUpdate({
        target: [backdropFocus.provider, backdropFocus.imageKey, backdropFocus.algorithmVersion],
        set: {
          state: 'ready',
          focusX: focus.x,
          focusY: focus.y,
          analyzedAt: Date.now(),
          retryAfter: null,
          errorCode: null,
        },
      })
      .run();
  }

  /**
   * Records failure for the current algorithm, clears focus, and defers retries for one hour.
   * Database errors propagate.
   */
  saveFailure(key: BackdropFocusKey, errorCode: string): void {
    this.db
      .insert(backdropFocus)
      .values({
        ...key,
        algorithmVersion: BACKDROP_FOCUS_ALGORITHM_VERSION,
        state: 'failed',
        focusX: null,
        focusY: null,
        analyzedAt: Date.now(),
        retryAfter: Date.now() + FAILURE_RETRY_MS,
        errorCode,
      })
      .onConflictDoUpdate({
        target: [backdropFocus.provider, backdropFocus.imageKey, backdropFocus.algorithmVersion],
        set: {
          state: 'failed',
          focusX: null,
          focusY: null,
          analyzedAt: Date.now(),
          retryAfter: Date.now() + FAILURE_RETRY_MS,
          errorCode,
        },
      })
      .run();
  }
}
