import type { Quality } from '@miauflix/source-metadata-extractor';

import type { MovieSource } from '@entities/movie-source.entity';
import type { PlayableRef } from '@routes/playable.types';
import type { PreloadWarmupState } from '@routes/preload.types';
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
  warmup: { state: PreloadWarmupState };
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

  async prepare(playable: PlayableRef, options: PreparationOptions): Promise<PreparedPlayable> {
    if (playable.kind !== 'movie') {
      return { playable, source: null, state: 'cold', warmup: { state: 'not_requested' } };
    }

    this.throwIfAborted(options.signal);
    const media = await this.mediaService.getMovieByMediaId(playable.mediaId);
    this.throwIfAborted(options.signal);
    if (!media) {
      return { playable, source: null, state: 'cold', warmup: { state: 'not_requested' } };
    }
    if (options.through === 'catalog') {
      return { playable, source: null, state: 'metadata', warmup: { state: 'not_requested' } };
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
      return { playable, source: null, state: 'cold', warmup: { state: 'not_requested' } };
    }
    const usableSource = this.select(sources, options.preferences);
    if (options.through === 'sources') {
      const source = usableSource ?? this.select(sources, options.preferences, false);
      if (source) options.onSourceSelected?.(source);
      return {
        playable,
        source,
        state: 'metadata',
        warmup: { state: 'not_requested' },
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
      warmup: { state: 'not_requested' },
    };
  }

  private async finish(
    playable: PlayableRef,
    source: MovieSource,
    options: PreparationOptions
  ): Promise<PreparedPlayable> {
    options.onSourceSelected?.(source);
    if (options.through !== 'warm') {
      return { playable, source, state: 'ready', warmup: { state: 'not_requested' } };
    }
    if (!this.warmup) {
      return { playable, source, state: 'cold', warmup: { state: 'not_requested' } };
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
      return { playable, source, state: 'cold', warmup: { state: 'failed' } };
    }
    if (options.signal?.aborted) {
      await this.warmup.pause(options.ownerKey ?? playableKey(playable), slot.generation);
      this.throwIfAborted(options.signal);
    }
    if (slot.state === 'ready') {
      return { playable, source, state: 'ready', warmup: { state: 'ready' } };
    }
    if (
      slot.state === 'warming' ||
      slot.state === 'adding_torrent' ||
      slot.state === 'resolving_store'
    ) {
      return { playable, source, state: 'warming', warmup: { state: 'warming' } };
    }
    if (slot.state === 'paused') {
      return { playable, source, state: 'cold', warmup: { state: 'paused' } };
    }
    return { playable, source, state: 'cold', warmup: { state: 'failed' } };
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

function playableKey(playable: PlayableRef): string {
  if (playable.kind === 'movie') return `m:${playable.mediaId}`;
  return `e:${playable.showMediaId}:${playable.seasonNumber}:${playable.episodeNumber}`;
}
