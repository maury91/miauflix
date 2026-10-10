import type { Quality } from '@miauflix/source-metadata-extractor';

import type { MovieSource } from '@entities/movie-source.entity';
import type { PlayableRef } from '@routes/playable.types';
import type { PreloadWarmupSnapshot, PreloadWarmupState } from '@routes/preload.types';
import type { MediaService } from '@services/media/media.service';
import type { SourceService } from '@services/source/source.service';
import { filterHevcSources, filterSources } from '@services/stream/stream.util';

import type { TorrentWarmupController } from './torrent-warmup.controller';

export interface PlaybackPreferences {
  quality: Quality | 'auto';
  allowHevc: boolean;
}

export interface PreparedPlayable {
  playable: PlayableRef;
  source: MovieSource | null;
  state: 'cold' | 'metadata' | 'ready' | 'warming';
  warmup: PreloadWarmupSnapshot;
}

export interface PreparationOptions {
  through: 'catalog' | 'metadata' | 'sources' | 'warm';
  preferences: PlaybackPreferences;
  workClass: 'background' | 'interactive';
  ownerKey?: string;
  signal?: AbortSignal;
  onSourceSelected?: (source: MovieSource) => void;
}

/** Shared inline preparation seam for focus, details, and Watch. */
export class PlayablePreparationService {
  constructor(
    private readonly mediaService: MediaService,
    private readonly sourceService: SourceService,
    private readonly warmup?: TorrentWarmupController
  ) {}

  /**
   * Prepare a movie through catalog lookup, source discovery, metadata resolution, or payload warmup.
   * Episodes, missing movies, and empty source lists return a cold result with no source.
   * Quality and HEVC preferences guide selection; workClass sets the source discovery wait budget.
   * Metadata-resolution failures permit fallback selection, and warmup failures retain the source.
   * Lookup and source-selection callback errors propagate; observed cancellation rejects with
   * AbortError, or with an in-flight error if cancellation coincides with a failure.
   */
  async prepare(playable: PlayableRef, options: PreparationOptions): Promise<PreparedPlayable> {
    if (playable.kind !== 'movie') {
      return { playable, source: null, state: 'cold', warmup: emptyWarmup() };
    }

    this.throwIfAborted(options.signal);
    const media = await this.mediaService.getMovieByMediaId(playable.mediaId);
    this.throwIfAborted(options.signal);
    if (!media) {
      return { playable, source: null, state: 'cold', warmup: emptyWarmup() };
    }
    if (options.through === 'catalog') {
      return { playable, source: null, state: 'metadata', warmup: emptyWarmup() };
    }

    let sources = await this.sourceService.getSourcesForMovieWithOnDemandSearch(
      {
        id: media.local.id,
        imdbId: media.local.imdbId,
        title: media.local.title,
        contentDirectoriesSearched: media.local.contentDirectoriesSearched,
      },
      options.workClass === 'interactive' ? 3_000 : 500
    );
    this.throwIfAborted(options.signal);
    if (!sources.length) {
      return { playable, source: null, state: 'cold', warmup: emptyWarmup() };
    }
    const usableSource = this.select(sources, options.preferences);
    if (options.through === 'sources') {
      const source = usableSource ?? this.select(sources, options.preferences, false);
      if (source) options.onSourceSelected?.(source);
      return {
        playable,
        source,
        state: 'metadata',
        warmup: emptyWarmup(),
      };
    }
    if (usableSource) {
      return this.finish(playable, usableSource, options);
    }

    let fallbackSource = this.select(sources, options.preferences, false);
    const metadataCandidates = this.sortCandidates(sources, options.preferences, false)
      .filter(source => !source.file)
      .slice(0, 2);
    for (const source of metadataCandidates) {
      this.throwIfAborted(options.signal);
      if (!source.file) {
        try {
          await this.sourceService.processSourceMetadata(source.id);
        } catch (error) {
          if (options.signal?.aborted) throw error;
          // A source can still be prepared directly from its magnet link. Metadata
          // resolution is an optimization for selection, not a playback prerequisite.
        }
        this.throwIfAborted(options.signal);
      }
      sources = await this.sourceService.getSourcesForMovie(media.local.id);
      const selected = this.select(sources, options.preferences);
      if (selected) {
        return this.finish(playable, selected, options);
      }
      fallbackSource = this.select(sources, options.preferences, false);
    }

    if (fallbackSource && options.through === 'warm') {
      return this.finish(playable, fallbackSource, options);
    }
    return {
      playable,
      source: fallbackSource,
      state: 'metadata',
      warmup: emptyWarmup(),
    };
  }

  /**
   * Notify the caller of the selected source and optionally request payload warmup.
   * Return warmup byte counts and percentage when available. Warmup failures become a cold result
   * unless aborted; callback errors, cancellation, and failures while pausing on abort propagate.
   */
  private async finish(
    playable: PlayableRef,
    source: MovieSource,
    options: PreparationOptions
  ): Promise<PreparedPlayable> {
    options.onSourceSelected?.(source);
    if (options.through !== 'warm') {
      return { playable, source, state: 'ready', warmup: emptyWarmup() };
    }
    if (!this.warmup) {
      return { playable, source, state: 'cold', warmup: emptyWarmup() };
    }
    let slot: Awaited<ReturnType<TorrentWarmupController['warm']>>;
    try {
      slot = await this.warmup.warm(
        source,
        options.ownerKey ?? playableKey(playable),
        playableKey(playable),
        { speculativeExpiresAt: new Date(Date.now() + 15_000) }
      );
    } catch (error) {
      if (options.signal?.aborted) throw error;
      // Payload warming is optional. Keep the exact prepared source available
      // so Watch can use the normal cold streaming path.
      return { playable, source, state: 'cold', warmup: emptyWarmup('failed') };
    }
    if (options.signal?.aborted) {
      await this.warmup.pause(options.ownerKey ?? playableKey(playable), slot.generation);
      this.throwIfAborted(options.signal);
    }
    if (slot.state === 'ready') {
      return {
        playable,
        source,
        state: 'ready',
        warmup: {
          state: 'ready',
          progress: slot.progress,
          verifiedBytes: slot.verifiedBytes,
          targetBytes: slot.targetVerifiedBytes,
        },
      };
    }
    if (
      slot.state === 'warming' ||
      slot.state === 'adding_torrent' ||
      slot.state === 'resolving_store'
    ) {
      return {
        playable,
        source,
        state: 'warming',
        warmup: {
          state: 'warming',
          progress: slot.progress,
          verifiedBytes: slot.verifiedBytes,
          targetBytes: slot.targetVerifiedBytes,
        },
      };
    }
    if (slot.state === 'paused') {
      return {
        playable,
        source,
        state: 'cold',
        warmup: {
          state: 'paused',
          progress: slot.progress,
          verifiedBytes: slot.verifiedBytes,
          targetBytes: slot.targetVerifiedBytes,
        },
      };
    }
    return {
      playable,
      source,
      state: 'cold',
      warmup: {
        state: 'failed',
        progress: slot.progress,
        verifiedBytes: slot.verifiedBytes,
        targetBytes: slot.targetVerifiedBytes,
      },
    };
  }

  private select(
    sources: MovieSource[],
    preferences: PlaybackPreferences,
    requireFile = true
  ): MovieSource | null {
    const compatible = this.sortCandidates(sources, preferences, requireFile);
    if (!compatible.length) return null;
    if (preferences.quality === 'auto') return compatible[0];
    return (
      compatible.find(
        source => source.quality?.toLowerCase() === preferences.quality.toLowerCase()
      ) ?? compatible[0]
    );
  }

  private sortCandidates(
    sources: MovieSource[],
    preferences: PlaybackPreferences,
    requireFile: boolean
  ): MovieSource[] {
    const compatible = requireFile
      ? filterSources([...sources], preferences.allowHevc)
      : filterHevcSources([...sources], preferences.allowHevc).sort(
          (a, b) => (b.streamingScore || 0) - (a.streamingScore || 0)
        );
    return compatible;
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new DOMException('Preparation cancelled', 'AbortError');
  }
}

/** Create a warmup snapshot with zero measured progress and byte counts. */
function emptyWarmup(state: PreloadWarmupState = 'not_requested'): PreloadWarmupSnapshot {
  return { state, progress: 0, verifiedBytes: 0, targetBytes: 0 };
}

function playableKey(playable: PlayableRef): string {
  if (playable.kind === 'movie') return `m:${playable.mediaId}`;
  return `e:${playable.showMediaId}:${playable.seasonNumber}:${playable.episodeNumber}`;
}
