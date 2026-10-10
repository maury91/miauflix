import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';

import type { MediaRef } from '../types';
import type { CatalogDatabase } from './database';
import { artworkBackdropCache, artworkLogoAssets, artworkLogoCache, mediaArtwork } from './schema';

export const ARTWORK_ALGORITHM_VERSION = 'local-contrast-v1';
export const ARTWORK_TARGET_COVERAGE = 0.8;

export interface ArtworkCandidate {
  url: string;
  language: string | null;
  width: number;
  height: number;
  voteAverage: number;
  voteCount: number;
}

export interface ArtworkMeasurement {
  index: number;
  url: string;
  card: { coverage: number; median: number; passes: boolean };
  hero: { coverage: number; median: number; passes: boolean };
}

export type ArtworkRow = typeof mediaArtwork.$inferSelect;

export class ArtworkRepository {
  constructor(private readonly database: CatalogDatabase) {}

  private get db() {
    return this.database.db;
  }

  get(mediaType: MediaRef['mediaType'], mediaId: number): ArtworkRow | undefined {
    return this.db
      .select()
      .from(mediaArtwork)
      .where(and(eq(mediaArtwork.mediaType, mediaType), eq(mediaArtwork.mediaId, mediaId)))
      .get();
  }

  enqueue(input: {
    mediaType: MediaRef['mediaType'];
    mediaId: number;
    signature: string;
    imageKey: string;
    backdropUrl: string;
    displayBackdrop: string;
    fallbackLogo: string;
    candidates: ArtworkCandidate[];
    popularity: number;
    priority: number;
  }): ArtworkRow {
    const now = Date.now();
    const existing = this.get(input.mediaType, input.mediaId);
    if (existing?.inputSignature === input.signature) {
      const retryReady = existing.status === 'failed' && (existing.retryAfter ?? 0) <= now;
      const next = this.db
        .update(mediaArtwork)
        .set({
          priority: Math.max(existing.priority, input.priority),
          popularity: input.popularity,
          status: retryReady ? 'pending' : existing.status,
          retryAfter: retryReady ? null : existing.retryAfter,
          queuedAt: retryReady ? now : existing.queuedAt,
        })
        .where(
          and(eq(mediaArtwork.mediaType, input.mediaType), eq(mediaArtwork.mediaId, input.mediaId))
        )
        .returning()
        .get();
      return next ?? existing;
    }

    this.db
      .insert(mediaArtwork)
      .values({
        mediaType: input.mediaType,
        mediaId: input.mediaId,
        inputSignature: input.signature,
        imageKey: input.imageKey,
        backdropUrl: input.backdropUrl,
        displayBackdrop: input.displayBackdrop,
        cardLogo: input.candidates.length ? input.fallbackLogo : '',
        heroLogo: input.candidates.length ? input.fallbackLogo : '',
        candidates: JSON.stringify(input.candidates),
        measurements: '[]',
        cursor: 0,
        popularity: input.popularity,
        priority: input.priority,
        status: input.candidates.length === 0 ? 'ready' : 'pending',
        cardComplete: input.candidates.length === 0,
        heroComplete: input.candidates.length === 0,
        cardStatus: input.candidates.length === 0 ? 'ready' : 'pending',
        heroStatus: input.candidates.length === 0 ? 'ready' : 'pending',
        revision: (existing?.revision ?? 0) + 1,
        attempts: 0,
        retryAfter: null,
        queuedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [mediaArtwork.mediaType, mediaArtwork.mediaId],
        set: {
          inputSignature: input.signature,
          imageKey: input.imageKey,
          backdropUrl: input.backdropUrl,
          displayBackdrop: input.displayBackdrop,
          cardLogo: input.candidates.length ? input.fallbackLogo : '',
          heroLogo: input.candidates.length ? input.fallbackLogo : '',
          candidates: JSON.stringify(input.candidates),
          measurements: '[]',
          cursor: 0,
          popularity: input.popularity,
          priority: input.priority,
          status: input.candidates.length === 0 ? 'ready' : 'pending',
          cardComplete: input.candidates.length === 0,
          heroComplete: input.candidates.length === 0,
          cardStatus: input.candidates.length === 0 ? 'ready' : 'pending',
          heroStatus: input.candidates.length === 0 ? 'ready' : 'pending',
          revision: (existing?.revision ?? 0) + 1,
          attempts: 0,
          retryAfter: null,
          queuedAt: now,
          updatedAt: now,
        },
      })
      .run();
    return this.get(input.mediaType, input.mediaId)!;
  }

  nextPending(): ArtworkRow | undefined {
    const now = Date.now();
    return this.db
      .select()
      .from(mediaArtwork)
      .where(
        and(
          inArray(mediaArtwork.status, ['pending', 'failed']),
          or(isNull(mediaArtwork.retryAfter), lte(mediaArtwork.retryAfter, now))
        )
      )
      .orderBy(
        desc(mediaArtwork.priority),
        desc(mediaArtwork.popularity),
        asc(mediaArtwork.mediaType),
        asc(mediaArtwork.mediaId),
        asc(mediaArtwork.queuedAt)
      )
      .limit(1)
      .get();
  }

  nextRetryAt(): number | undefined {
    return (
      this.db
        .select({ retryAfter: mediaArtwork.retryAfter })
        .from(mediaArtwork)
        .where(
          and(
            inArray(mediaArtwork.status, ['pending', 'failed']),
            gt(mediaArtwork.retryAfter, Date.now())
          )
        )
        .orderBy(asc(mediaArtwork.retryAfter))
        .limit(1)
        .get()?.retryAfter ?? undefined
    );
  }

  saveBackdrop(imageKey: string, pixels: string, luminance: string, pixelBytes: number): void {
    this.db
      .insert(artworkBackdropCache)
      .values({
        imageKey,
        algorithmVersion: ARTWORK_ALGORITHM_VERSION,
        pixels,
        luminance,
        pixelBytes,
        createdAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: [artworkBackdropCache.imageKey, artworkBackdropCache.algorithmVersion],
        set: { pixels, luminance, pixelBytes, createdAt: Date.now() },
      })
      .run();
  }

  getBackdrop(imageKey: string) {
    return this.db
      .select()
      .from(artworkBackdropCache)
      .where(
        and(
          eq(artworkBackdropCache.imageKey, imageKey),
          eq(artworkBackdropCache.algorithmVersion, ARTWORK_ALGORITHM_VERSION)
        )
      )
      .get();
  }

  getLogo(imageKey: string, logoUrl: string) {
    return this.db
      .select()
      .from(artworkLogoCache)
      .where(
        and(
          eq(artworkLogoCache.imageKey, imageKey),
          eq(artworkLogoCache.logoUrl, logoUrl),
          eq(artworkLogoCache.algorithmVersion, ARTWORK_ALGORITHM_VERSION)
        )
      )
      .get();
  }

  getLogoAsset(assetUrl: string) {
    return this.db
      .select()
      .from(artworkLogoAssets)
      .where(
        and(
          eq(artworkLogoAssets.assetUrl, assetUrl),
          eq(artworkLogoAssets.algorithmVersion, ARTWORK_ALGORITHM_VERSION)
        )
      )
      .get();
  }

  saveLogoAsset(input: {
    assetUrl: string;
    decodedPng: string;
    width: number;
    height: number;
  }): void {
    const now = Date.now();
    this.db
      .insert(artworkLogoAssets)
      .values({
        assetUrl: input.assetUrl,
        algorithmVersion: ARTWORK_ALGORITHM_VERSION,
        decodedPng: input.decodedPng,
        width: input.width,
        height: input.height,
        failedAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [artworkLogoAssets.assetUrl, artworkLogoAssets.algorithmVersion],
        set: {
          decodedPng: input.decodedPng,
          width: input.width,
          height: input.height,
          failedAt: null,
          updatedAt: now,
        },
      })
      .run();
  }

  saveLogoAssetFailure(assetUrl: string): number {
    const failedAt = Date.now();
    this.db
      .insert(artworkLogoAssets)
      .values({
        assetUrl,
        algorithmVersion: ARTWORK_ALGORITHM_VERSION,
        failedAt,
        updatedAt: failedAt,
      })
      .onConflictDoUpdate({
        target: [artworkLogoAssets.assetUrl, artworkLogoAssets.algorithmVersion],
        set: {
          decodedPng: null,
          width: null,
          height: null,
          failedAt,
          updatedAt: failedAt,
        },
      })
      .run();
    return failedAt;
  }

  saveLogo(input: {
    imageKey: string;
    logoUrl: string;
    card: ArtworkMeasurement['card'];
    hero: ArtworkMeasurement['hero'];
  }): void {
    const now = Date.now();
    this.db
      .insert(artworkLogoCache)
      .values({
        imageKey: input.imageKey,
        logoUrl: input.logoUrl,
        algorithmVersion: ARTWORK_ALGORITHM_VERSION,
        cardPass: input.card.passes,
        cardCoverage: input.card.coverage,
        cardMedian: input.card.median,
        heroPass: input.hero.passes,
        heroCoverage: input.hero.coverage,
        heroMedian: input.hero.median,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [
          artworkLogoCache.imageKey,
          artworkLogoCache.logoUrl,
          artworkLogoCache.algorithmVersion,
        ],
        set: {
          cardPass: input.card.passes,
          cardCoverage: input.card.coverage,
          cardMedian: input.card.median,
          heroPass: input.hero.passes,
          heroCoverage: input.hero.coverage,
          heroMedian: input.hero.median,
          createdAt: now,
        },
      })
      .run();
  }

  progress(input: {
    mediaType: MediaRef['mediaType'];
    mediaId: number;
    signature: string;
    cursor: number;
    measurements: ArtworkMeasurement[];
    cardLogo?: string | null;
    heroLogo?: string | null;
    cardComplete?: boolean;
    heroComplete?: boolean;
    failed?: boolean;
    retryAfter?: number | null;
    retryPending?: boolean;
  }): ArtworkRow | undefined {
    const current = this.get(input.mediaType, input.mediaId);
    if (!current || current.inputSignature !== input.signature) return undefined;
    const cardComplete = input.cardComplete ?? current.cardComplete;
    const heroComplete = input.heroComplete ?? current.heroComplete;
    const failed = input.failed ?? false;
    const cardStatus = failed && !cardComplete ? 'failed' : cardComplete ? 'ready' : 'pending';
    const heroStatus = failed && !heroComplete ? 'failed' : heroComplete ? 'ready' : 'pending';
    const cardLogo = input.cardLogo === undefined ? current.cardLogo : input.cardLogo;
    const heroLogo = input.heroLogo === undefined ? current.heroLogo : input.heroLogo;
    return this.db
      .update(mediaArtwork)
      .set({
        cursor: input.cursor,
        measurements: JSON.stringify(input.measurements),
        cardLogo,
        heroLogo,
        cardComplete,
        heroComplete,
        cardStatus,
        heroStatus,
        status: input.retryPending ? 'pending' : cardComplete && heroComplete ? 'ready' : 'pending',
        retryAfter: input.retryAfter === undefined ? null : input.retryAfter,
        attempts: failed ? current.attempts + 1 : current.attempts,
        revision:
          cardLogo !== current.cardLogo ||
          heroLogo !== current.heroLogo ||
          cardStatus !== current.cardStatus ||
          heroStatus !== current.heroStatus
            ? current.revision + 1
            : current.revision,
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(mediaArtwork.mediaType, input.mediaType),
          eq(mediaArtwork.mediaId, input.mediaId),
          eq(mediaArtwork.inputSignature, input.signature)
        )
      )
      .returning()
      .get();
  }
}
