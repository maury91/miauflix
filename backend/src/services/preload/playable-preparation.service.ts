import type { Quality } from '@miauflix/source-metadata-extractor';

import type { ContentSource } from '@entities/content-source.entity';
import type { PlayableRef } from '@routes/playable.types';
import type { PreloadWarmupSnapshot, PreloadWarmupState } from '@routes/preload.types';
import type { MediaService } from '@services/media/media.service';
import type { PlaybackTarget } from '@services/playback/playback-target';
import type { PlaybackTargetService } from '@services/playback/playback-target.service';
import type { SourceService } from '@services/source/source.service';
import type { StorageService } from '@services/storage/storage.service';
import { filterHevcSources, filterSources } from '@services/stream/stream.util';

import type { TorrentWarmupController } from './torrent-warmup.controller';

export interface PlaybackPreferences {
  quality: Quality | 'auto';
  allowHevc: boolean;
}

export interface PreparedPlayable {
  playable: PlayableRef;
  source: ContentSource | null;
  /** The file to play. Episodes always know it; movies resolve it once they are warmed. */
  target: PlaybackTarget | null;
  state: 'cold' | 'metadata' | 'ready' | 'warming';
  warmup: PreloadWarmupSnapshot;
}

export interface PreparationOptions {
  through: 'catalog' | 'metadata' | 'sources' | 'warm';
  preferences: PlaybackPreferences;
  workClass: 'background' | 'interactive';
  ownerKey?: string;
  signal?: AbortSignal;
  onSourceSelected?: (source: ContentSource) => void;
}

/** Shared inline preparation seam for focus, details, and Watch. */
export class PlayablePreparationService {
  constructor(
    private readonly mediaService: MediaService,
    private readonly sourceService: SourceService,
    private readonly warmup?: TorrentWarmupController,
    private readonly storageService?: StorageService,
    private readonly targets?: Pick<PlaybackTargetService, 'forMovie'>
  ) {}

  /**
   * Prepare a playable through catalog lookup, source discovery, metadata resolution, or payload warmup.
   * Missing catalog data and empty source lists return a cold result with no source.
   * Completed local downloads take priority over fresh torrents. Quality ranks copies within
   * that group; HEVC compatibility still applies. workClass sets the discovery wait budget.
   * Metadata-resolution failures permit fallback selection, and warmup failures retain the source.
   * Lookup and source-selection callback errors propagate; observed cancellation rejects with
   * AbortError, or with an in-flight error if cancellation coincides with a failure.
   */
  async prepare(playable: PlayableRef, options: PreparationOptions): Promise<PreparedPlayable> {
    if (playable.kind === 'episode') return this.prepareEpisode(playable, options);

    this.throwIfAborted(options.signal);
    const media = await this.mediaService.getMovieByMediaId(playable.mediaId);
    this.throwIfAborted(options.signal);
    if (!media) {
      return { playable, source: null, target: null, state: 'cold', warmup: emptyWarmup() };
    }
    if (options.through === 'catalog') {
      return { playable, source: null, target: null, state: 'metadata', warmup: emptyWarmup() };
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
      return { playable, source: null, target: null, state: 'cold', warmup: emptyWarmup() };
    }
    const completedSources = this.storageService
      ? await Promise.all(
          filterHevcSources(sources, options.preferences.allowHevc).map(async source => {
            const storage = await this.storageService!.getStorageBySource(source.id);
            return storage &&
              (storage.videoCompletedAt || storage.localOnly || storage.downloaded >= 10000)
              ? source
              : null;
          })
        )
      : [];
    this.throwIfAborted(options.signal);
    const localSource = this.select(
      completedSources.filter((source): source is ContentSource => source !== null),
      options.preferences,
      false
    );
    const usableSource = localSource ?? this.select(sources, options.preferences);
    if (options.through === 'sources') {
      const source = usableSource ?? this.select(sources, options.preferences, false);
      if (source) options.onSourceSelected?.(source);
      return {
        playable,
        source,
        target: null,
        state: 'metadata',
        warmup: emptyWarmup(),
      };
    }
    const movieTarget = (source: ContentSource) => this.resolveMovieTarget(media.local.id, source);
    if (usableSource) {
      return this.finish(playable, usableSource, options, movieTarget);
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
        return this.finish(playable, selected, options, movieTarget);
      }
      fallbackSource = this.select(sources, options.preferences, false);
    }

    if (fallbackSource && options.through === 'warm') {
      return this.finish(playable, fallbackSource, options, movieTarget);
    }
    return {
      playable,
      source: fallbackSource,
      target: null,
      state: 'metadata',
      warmup: emptyWarmup(),
    };
  }

  private async prepareEpisode(
    playable: Extract<PlayableRef, { kind: 'episode' }>,
    options: PreparationOptions
  ): Promise<PreparedPlayable> {
    this.throwIfAborted(options.signal);
    const show = await this.mediaService.getTVShowByMediaId(playable.showMediaId);
    if (!show)
      return { playable, source: null, target: null, state: 'cold', warmup: emptyWarmup() };
    if (options.through === 'catalog')
      return { playable, source: null, target: null, state: 'metadata', warmup: emptyWarmup() };
    await this.mediaService.markShowAsWatching(show.local.id);
    const season = await this.mediaService.getSeason(playable.showMediaId, playable.seasonNumber);
    this.throwIfAborted(options.signal);
    const episode = season?.episodes.find(item => item.episodeNumber === playable.episodeNumber);
    if (!episode)
      return { playable, source: null, target: null, state: 'cold', warmup: emptyWarmup() };

    const matches = await this.sourceService.getSourcesForEpisodeWithOnDemandSearch({
      episodeId: episode.id,
      showMediaId: show.local.mediaId,
      showTitle: show.local.name,
      showImdbId: show.local.imdbId ?? null,
      seasonNumber: playable.seasonNumber,
      episodeNumber: playable.episodeNumber,
      airDate: episode.airDate,
    });
    this.throwIfAborted(options.signal);
    const candidates = matches.filter(
      match =>
        match.videoFilePath &&
        filterHevcSources([match.source], options.preferences.allowHevc).length
    );
    const exactCandidates = candidates.filter(match => match.matchKind === 'single');
    const usableCandidates = exactCandidates.length ? exactCandidates : candidates;
    const selected = this.select(
      usableCandidates.map(match => match.source),
      options.preferences,
      false
    );
    const match = usableCandidates.find(candidate => candidate.source.id === selected?.id);
    if (!selected || !match)
      return { playable, source: null, target: null, state: 'cold', warmup: emptyWarmup() };
    const target: PlaybackTarget = {
      source: selected,
      filePath: match.videoFilePath!,
      matchKind: match.matchKind,
    };
    options.onSourceSelected?.(selected);
    if (options.through === 'sources')
      return { playable, source: selected, target, state: 'metadata', warmup: emptyWarmup() };
    return this.finish(playable, selected, options, async () => target);
  }

  /** Movie targets need the source's file list; a missing resolver or file list leaves it unknown. */
  private async resolveMovieTarget(
    movieId: number,
    source: ContentSource
  ): Promise<PlaybackTarget | null> {
    if (!this.targets) return null;
    return this.targets.forMovie(movieId, source);
  }

  /**
   * Notify the caller of the selected source and optionally request payload warmup.
   * Return warmup byte counts and percentage when available. Warmup failures become a cold result
   * unless aborted; callback errors, cancellation, and failures while pausing on abort propagate.
   */
  private async finish(
    playable: PlayableRef,
    source: ContentSource,
    options: PreparationOptions,
    resolveTarget: (source: ContentSource) => Promise<PlaybackTarget | null>
  ): Promise<PreparedPlayable> {
    options.onSourceSelected?.(source);
    if (options.through !== 'warm') {
      return { playable, source, target: null, state: 'ready', warmup: emptyWarmup() };
    }
    let target: PlaybackTarget | null;
    try {
      target = await resolveTarget(source);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      // Without the source's file list nothing can be warmed or played yet.
      return { playable, source, target: null, state: 'cold', warmup: emptyWarmup('failed') };
    }
    this.throwIfAborted(options.signal);
    if (!this.warmup || !target) {
      return { playable, source, target, state: 'cold', warmup: emptyWarmup() };
    }
    let slot: Awaited<ReturnType<TorrentWarmupController['warm']>>;
    try {
      slot = await this.warmup.warm(
        target,
        options.ownerKey ?? playableKey(playable),
        playableKey(playable),
        { speculativeExpiresAt: new Date(Date.now() + 15_000) }
      );
    } catch (error) {
      if (options.signal?.aborted) throw error;
      // Payload warming is optional. Keep the exact prepared source available
      // so Watch can use the normal cold streaming path.
      return { playable, source, target, state: 'cold', warmup: emptyWarmup('failed') };
    }
    if (options.signal?.aborted) {
      await this.warmup.pause(options.ownerKey ?? playableKey(playable), slot.generation);
      this.throwIfAborted(options.signal);
    }
    if (slot.state === 'ready') {
      return {
        playable,
        source,
        target,
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
        target,
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
        target,
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
      target,
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
    sources: ContentSource[],
    preferences: PlaybackPreferences,
    requireFile = true
  ): ContentSource | null {
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
    sources: ContentSource[],
    preferences: PlaybackPreferences,
    requireFile: boolean
  ): ContentSource[] {
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
