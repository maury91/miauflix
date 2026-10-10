import { createHash } from 'node:crypto';

import {
  ARTWORK_ALGORITHM_VERSION,
  ARTWORK_TARGET_COVERAGE,
  type ArtworkCandidate,
  type ArtworkMeasurement,
  ArtworkRepository,
  type ArtworkRow,
} from '../db/artwork.repo';
import type { MovieRow, TVShowRow } from '../db/catalog-db.types';
import { logger } from '../logger';
import type { CatalogProvider } from '../provider/provider';
import type { MediaRef } from '../types';
import { ArtworkAnalysisWorkerClient } from './artwork-analysis.worker-client';

export interface ArtworkUpdate {
  mediaType: MediaRef['mediaType'];
  mediaId: number;
  backdrop: string;
  logo: string;
  heroLogo: string;
  artworkRevision: number;
  cardLogoStatus: 'pending' | 'ready' | 'failed';
  heroLogoStatus: 'pending' | 'ready' | 'failed';
}

const RETRY_DELAY_MS = 60 * 60_000;
const SCOPE = 'ArtworkSelection';

function displayLogoUrl(url: string): string {
  return url.replace('/w300/', '/original/');
}

function analysisLogoUrl(url: string): string {
  return url.replace('/original/', '/w300/');
}

function targetResult(
  measurements: ArtworkMeasurement[],
  target: 'card' | 'hero'
): ArtworkMeasurement | undefined {
  return [...measurements].sort(
    (left, right) =>
      right[target].coverage - left[target].coverage ||
      right[target].median - left[target].median ||
      left.index - right.index
  )[0];
}

function parseCandidates(value: string): ArtworkCandidate[] {
  const parsed = JSON.parse(value) as ArtworkCandidate[];
  return Array.isArray(parsed) ? parsed : [];
}

function parseMeasurements(value: string): ArtworkMeasurement[] {
  const parsed = JSON.parse(value) as ArtworkMeasurement[];
  return Array.isArray(parsed) ? parsed : [];
}

export class ArtworkSelectionService {
  private readonly worker: Pick<ArtworkAnalysisWorkerClient, 'prepare' | 'measure' | 'close'>;
  private readonly listeners = new Set<(update: ArtworkUpdate) => void>();
  private running = false;
  private stopped = true;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly repository: ArtworkRepository,
    private readonly provider: CatalogProvider,
    worker: Pick<
      ArtworkAnalysisWorkerClient,
      'prepare' | 'measure' | 'close'
    > = new ArtworkAnalysisWorkerClient()
  ) {
    this.worker = worker;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.pump();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    await this.worker.close();
  }

  subscribe(listener: (update: ArtworkUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(refs: MediaRef[]): ArtworkUpdate[] {
    return refs.flatMap(ref => {
      const row = this.repository.get(ref.mediaType, ref.mediaId);
      return row ? [this.toUpdate(row)] : [];
    });
  }

  enqueue(input: { ref: MediaRef; row: MovieRow | TVShowRow; priority: number }): void {
    const candidates = this.readCandidates(input.row.logo_candidates, input.row.logo ?? '');
    const focusSource = input.row.backdrop
      ? this.provider.getBackdropAnalysisSource(input.row.backdrop)
      : null;
    if (!focusSource || !input.row.backdrop) return;
    const backdropUrl = focusSource.url.replace('/w780/', '/w300/');
    const imageKey = `${this.provider.name}:${focusSource.key}`;
    const fallbackLogo = input.row.logo ?? '';
    const signature = createHash('sha256')
      .update(
        JSON.stringify({
          algorithm: ARTWORK_ALGORITHM_VERSION,
          imageKey,
          fallbackLogo,
          candidates,
        })
      )
      .digest('hex');
    const previous = this.repository.get(input.ref.mediaType, input.ref.mediaId);
    const row = this.repository.enqueue({
      mediaType: input.ref.mediaType,
      mediaId: input.ref.mediaId,
      signature,
      imageKey,
      backdropUrl,
      displayBackdrop: input.row.backdrop,
      fallbackLogo,
      candidates,
      popularity: input.row.popularity,
      priority: input.priority,
    });
    if (!previous || previous.inputSignature !== signature) this.publish(row);
    this.pump();
  }

  private readCandidates(value: string | null, fallback: string): ArtworkCandidate[] {
    const candidates = value ? parseCandidates(value) : [];
    if (candidates.length)
      return candidates.map(candidate => ({ ...candidate, url: displayLogoUrl(candidate.url) }));
    // Existing provider rows have one display logo but no candidate list. Hydration
    // refreshes them; retain that logo as a usable single-candidate fallback meanwhile.
    return fallback
      ? [
          {
            url: displayLogoUrl(fallback),
            language: 'en',
            width: 0,
            height: 0,
            voteAverage: 0,
            voteCount: 0,
          },
        ]
      : [];
  }

  private pump(): void {
    if (this.stopped || this.running) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const row = this.repository.nextPending();
    if (!row) {
      const nextRetryAt = this.repository.nextRetryAt();
      if (nextRetryAt !== undefined) {
        this.retryTimer = setTimeout(
          () => {
            this.retryTimer = undefined;
            this.pump();
          },
          Math.max(0, nextRetryAt - Date.now())
        );
      }
      return;
    }
    this.running = true;
    void this.process(row)
      .catch(error =>
        logger.warn(SCOPE, `Artwork scan failed for ${row.mediaType} ${row.mediaId}`, error)
      )
      .finally(() => {
        this.running = false;
        this.pump();
      });
  }

  private async process(row: ArtworkRow): Promise<void> {
    if (this.stopped) return;
    const startedAt = performance.now();
    const candidates = parseCandidates(row.candidates);
    const measurements = parseMeasurements(row.measurements);
    if (row.retryAfter !== null && row.retryAfter <= Date.now()) {
      const cardSelectionIndex = candidates.findIndex(value => value.url === row.cardLogo);
      const heroSelectionIndex = candidates.findIndex(value => value.url === row.heroLogo);
      const cardComplete =
        row.cardComplete && cardSelectionIndex >= 0 && cardSelectionIndex < row.cursor;
      const heroComplete =
        row.heroComplete && heroSelectionIndex >= 0 && heroSelectionIndex < row.cursor;
      const previousRevision = row.revision;
      const reset = this.repository.progress({
        mediaType: row.mediaType,
        mediaId: row.mediaId,
        signature: row.inputSignature,
        cursor: row.cursor,
        measurements,
        cardComplete,
        heroComplete,
        retryAfter: null,
      });
      if (reset) {
        row = reset;
        if (reset.revision !== previousRevision) this.publish(reset);
      }
    }
    let backdrop = this.repository.getBackdrop(row.imageKey);
    if (!backdrop || !backdrop.luminance) {
      try {
        const prepared = await this.worker.prepare(row.backdropUrl);
        if (this.stopped) return;
        this.repository.saveBackdrop(
          row.imageKey,
          prepared.png,
          prepared.luminance,
          prepared.pixelBytes
        );
        backdrop = this.repository.getBackdrop(row.imageKey);
      } catch (error) {
        if (this.stopped) return;
        const failed = this.repository.progress({
          mediaType: row.mediaType,
          mediaId: row.mediaId,
          signature: row.inputSignature,
          cursor: row.cursor,
          measurements: parseMeasurements(row.measurements),
          failed: true,
          retryAfter: Date.now() + RETRY_DELAY_MS,
        });
        if (failed && failed.revision !== row.revision) this.publish(failed);
        logger.warn(
          SCOPE,
          `Backdrop preparation failed for ${row.mediaType} ${row.mediaId}`,
          error
        );
        return;
      }
    }
    if (!backdrop || this.stopped) return;

    if (row.cardComplete && row.heroComplete) return;
    if (row.cursor >= candidates.length) {
      this.complete(row, candidates, measurements);
      return;
    }

    const index = row.cursor;
    const candidate = candidates[index];
    if (!candidate) return;
    const analysisUrl = analysisLogoUrl(candidate.url);
    const cached = this.repository.getLogo(row.imageKey, analysisUrl);
    const asset = this.repository.getLogoAsset(analysisUrl);
    let measurement = measurements.find(
      value => value.index === index && value.url === candidate.url
    );
    const cacheHit = Boolean(cached || asset || measurement);
    if (cached && !measurement) {
      measurement = {
        index,
        url: candidate.url,
        card: {
          coverage: cached.cardCoverage ?? 0,
          median: cached.cardMedian ?? 0,
          passes: cached.cardPass === true,
        },
        hero: {
          coverage: cached.heroCoverage ?? 0,
          median: cached.heroMedian ?? 0,
          passes: cached.heroPass === true,
        },
      };
    }
    if (
      !measurement &&
      asset &&
      asset.failedAt !== null &&
      asset.failedAt + RETRY_DELAY_MS > Date.now()
    ) {
      this.advancePastFailedCandidate(
        row,
        candidates,
        measurements,
        candidate,
        index,
        asset.failedAt
      );
      return;
    }
    if (!measurement) {
      let analyzed: Awaited<ReturnType<ArtworkAnalysisWorkerClient['measure']>>;
      try {
        analyzed = await this.worker.measure({
          backdropPng: backdrop.pixels,
          backdropLuminance: backdrop.luminance,
          logoUrl: analysisUrl,
          decodedPng: asset?.decodedPng ?? undefined,
        });
      } catch (error) {
        if (this.stopped) return;
        const failedAt = this.repository.saveLogoAssetFailure(analysisUrl);
        this.advancePastFailedCandidate(row, candidates, measurements, candidate, index, failedAt);
        logger.warn(
          SCOPE,
          `Skipping unusable logo ${index} for ${row.mediaType} ${row.mediaId}`,
          error
        );
        return;
      }
      if (this.stopped) return;
      measurement = { index, url: candidate.url, card: analyzed.card, hero: analyzed.hero };
      this.repository.saveLogoAsset({
        assetUrl: analysisUrl,
        decodedPng: analyzed.decodedPng,
        width: analyzed.width,
        height: analyzed.height,
      });
      this.repository.saveLogo({
        imageKey: row.imageKey,
        logoUrl: analysisUrl,
        card: analyzed.card,
        hero: analyzed.hero,
      });
    }

    const updatedMeasurements = [
      ...measurements.filter(value => value.index !== index),
      measurement,
    ];
    const isLast = index + 1 >= candidates.length;
    const cardPass = !row.cardComplete && measurement.card.passes;
    const heroPass = !row.heroComplete && measurement.hero.passes;
    const nextCursor = index + 1;
    const cardComplete = row.cardComplete || cardPass || isLast;
    const heroComplete = row.heroComplete || heroPass || isLast;
    const cardLogo = row.cardComplete
      ? undefined
      : cardPass
        ? candidate.url
        : isLast
          ? (targetResult(updatedMeasurements, 'card')?.url ?? '')
          : undefined;
    const heroLogo = row.heroComplete
      ? undefined
      : heroPass
        ? candidate.url
        : isLast
          ? (targetResult(updatedMeasurements, 'hero')?.url ?? '')
          : undefined;
    const retry =
      cardComplete && heroComplete
        ? this.retryCandidate(row.imageKey, candidates, updatedMeasurements)
        : null;
    const saved = this.repository.progress({
      mediaType: row.mediaType,
      mediaId: row.mediaId,
      signature: row.inputSignature,
      cursor: retry ? retry.index : nextCursor,
      measurements: updatedMeasurements,
      cardLogo,
      heroLogo,
      cardComplete,
      heroComplete,
      retryPending: Boolean(retry),
      retryAfter: retry?.retryAfter ?? null,
    });
    if (saved && saved.revision !== row.revision) this.publish(saved);
    logger.info(SCOPE, 'Artwork logo analyzed', {
      mediaType: row.mediaType,
      mediaId: row.mediaId,
      candidateIndex: index,
      candidatesExamined: index + 1,
      durationMs: Math.round(performance.now() - startedAt),
      cacheHit,
      queueAgeMs: Math.max(0, Date.now() - row.queuedAt),
      preparedBackdropBytes: backdrop.pixelBytes,
      coverageThreshold: ARTWORK_TARGET_COVERAGE,
    });
  }

  private complete(
    row: ArtworkRow,
    candidates: ArtworkCandidate[],
    measurements: ArtworkMeasurement[]
  ): void {
    const card = row.cardComplete ? undefined : targetResult(measurements, 'card');
    const hero = row.heroComplete ? undefined : targetResult(measurements, 'hero');
    const saved = this.repository.progress({
      mediaType: row.mediaType,
      mediaId: row.mediaId,
      signature: row.inputSignature,
      cursor: candidates.length,
      measurements,
      cardLogo: row.cardComplete ? undefined : (card?.url ?? ''),
      heroLogo: row.heroComplete ? undefined : (hero?.url ?? ''),
      cardComplete: true,
      heroComplete: true,
    });
    if (saved && saved.revision !== row.revision) this.publish(saved);
  }

  private advancePastFailedCandidate(
    row: ArtworkRow,
    candidates: ArtworkCandidate[],
    measurements: ArtworkMeasurement[],
    candidate: ArtworkCandidate,
    index: number,
    failedAt: number
  ): void {
    const isLast = index + 1 >= candidates.length;
    if (!isLast) {
      const saved = this.repository.progress({
        mediaType: row.mediaType,
        mediaId: row.mediaId,
        signature: row.inputSignature,
        cursor: index + 1,
        measurements,
      });
      if (saved && saved.revision !== row.revision) this.publish(saved);
      return;
    }
    const retry = this.retryCandidate(row.imageKey, candidates, measurements, {
      index,
      url: candidate.url,
      createdAt: failedAt,
    });
    const saved = this.repository.progress({
      mediaType: row.mediaType,
      mediaId: row.mediaId,
      signature: row.inputSignature,
      cursor: retry?.index ?? candidates.length,
      measurements,
      cardLogo: row.cardComplete ? undefined : (targetResult(measurements, 'card')?.url ?? ''),
      heroLogo: row.heroComplete ? undefined : (targetResult(measurements, 'hero')?.url ?? ''),
      cardComplete: true,
      heroComplete: true,
      retryPending: Boolean(retry),
      retryAfter: retry?.retryAfter ?? null,
    });
    if (saved && saved.revision !== row.revision) this.publish(saved);
  }

  private retryCandidate(
    imageKey: string,
    candidates: ArtworkCandidate[],
    measurements: ArtworkMeasurement[],
    latestFailure?: { index: number; url: string; createdAt: number }
  ): { index: number; retryAfter: number } | null {
    const failures = candidates.flatMap((candidate, index) => {
      const asset = this.repository.getLogoAsset(analysisLogoUrl(candidate.url));
      return asset?.failedAt !== null && asset?.failedAt !== undefined
        ? [{ index, createdAt: asset.failedAt }]
        : [];
    });
    if (latestFailure)
      failures.push({ index: latestFailure.index, createdAt: latestFailure.createdAt });
    const firstCardPass = measurements
      .filter(value => value.card.passes)
      .reduce<
        number | undefined
      >((minimum, value) => Math.min(minimum ?? value.index, value.index), undefined);
    const firstHeroPass = measurements
      .filter(value => value.hero.passes)
      .reduce<
        number | undefined
      >((minimum, value) => Math.min(minimum ?? value.index, value.index), undefined);
    const relevant = failures.filter(
      failure =>
        firstCardPass === undefined ||
        firstHeroPass === undefined ||
        failure.index < firstCardPass ||
        failure.index < firstHeroPass
    );
    if (!relevant.length) return null;
    const first = Math.min(...relevant.map(failure => failure.index));
    const next = relevant.find(failure => failure.index === first)!;
    return {
      index: first,
      retryAfter: Math.max(Date.now() + RETRY_DELAY_MS, next.createdAt + RETRY_DELAY_MS),
    };
  }

  private toUpdate(row: ArtworkRow): ArtworkUpdate {
    return {
      mediaType: row.mediaType,
      mediaId: row.mediaId,
      backdrop: row.displayBackdrop,
      logo: row.cardLogo ?? '',
      heroLogo: row.heroLogo ?? '',
      artworkRevision: row.revision,
      cardLogoStatus: row.cardStatus,
      heroLogoStatus: row.heroStatus,
    };
  }

  private publish(row: ArtworkRow): void {
    const update = this.toUpdate(row);
    for (const listener of this.listeners) listener(update);
  }
}
