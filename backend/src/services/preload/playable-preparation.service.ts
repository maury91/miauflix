import { logger } from '@logger';
import type { Quality } from '@miauflix/source-metadata-extractor';
import parseTorrent from 'parse-torrent';

import type { ContentSource } from '@entities/content-source.entity';
import type { EpisodeSource } from '@entities/episode-source.entity';
import type { PlayableRef } from '@mytypes/playable.types';
import type { PreloadWarmupSnapshot, PreloadWarmupState } from '@mytypes/preload.types';
import type { MediaService } from '@services/media/media.service';
import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';
import type { PlaybackTarget } from '@services/playback/playback-target';
import type { PlaybackTargetService } from '@services/playback/playback-target.service';
import {
  filterSources,
  filterVideoCodecSources,
  fitsBitrate,
  type PlayedSize,
  preferWithinBitrate,
} from '@services/playback/source-filters';
import type { SourceService } from '@services/source/source.service';
import { isUsableSource } from '@services/source/source-availability.service';
import type { SourceHealthService } from '@services/source/source-health.service';
import { isVideoFile } from '@services/source/video-files';
import {
  madeForOtherLanguage,
  viewerLanguageFirst,
  viewerLanguages,
} from '@utils/release-language.util';
import { byPlaybackRank } from '@utils/streaming-score.util';

import type { SourceWarmupController } from './source-warmup.controller';

export interface PlaybackPreferences {
  subtitleLanguage?: string;
  /** The browser's languages ("it-IT"); releases made for other languages rank last. */
  audioLanguages?: string[];
  quality: Quality | 'auto';
  allowHevc: boolean;
  /** The video codecs the client decodes, in ffprobe's names (a TV reports them). */
  supportedVideoCodecs?: string[];
  /** The highest average bitrate the client's connection sustains; leaner sources win. */
  maxBitrateKbps?: number;
}

/** What a bitrate cap needs to estimate a candidate's bitrate. */
interface BitrateBudget {
  runtimeSeconds: number;
  /** The bytes a candidate plays; the whole source by default. */
  sizeOf?: PlayedSize;
}

/** Torrent files parsed for their episode file sizes, by source and file. */
const EPISODE_FILE_SIZES_LIMIT = 500;

export interface PreparedPlayable {
  playable: PlayableRef;
  source: ContentSource | null;
  /** The file to play. Episodes always know it; movies resolve it once they are warmed. */
  target: PlaybackTarget | null;
  state: 'cold' | 'metadata' | 'ready' | 'warming';
  warmup: PreloadWarmupSnapshot;
  /** Sources were found, but every one is known to hold no playable video. */
  exhausted?: boolean;
}

/** Which candidate is being tried: `position` of `total` compatible sources. */
export interface SourceAttempt {
  sourceId: number;
  position: number;
  total: number;
}

export interface PreparationOptions {
  through: 'catalog' | 'metadata' | 'sources' | 'warm';
  preferences: PlaybackPreferences;
  workClass: 'background' | 'interactive';
  ownerKey?: string;
  signal?: AbortSignal;
  onSourceSelected?: (source: ContentSource) => void;
  /** Called before each candidate's file list is checked, so viewers can follow along. */
  onSourceAttempt?: (attempt: SourceAttempt) => void;
  /** Sources to leave out, e.g. the one a backup is being prepared for. */
  avoidSourceIds?: readonly number[];
  /** With `warm`: resolve the file to play but leave warming to the caller. */
  resolveOnly?: boolean;
  /** With `warm`: where playback will resume, as a fraction (0–1) of the playable's duration. */
  resumeFraction?: number;
}

/** Sources tried for one preparation before reporting the last result. */
const MAX_SOURCE_ATTEMPTS = 8;

export interface PlayablePreparationServiceOptions {
  mediaService: MediaService;
  sourceService: SourceService;
  warmup?: SourceWarmupController;
  storage?: Pick<MediaLoadClientService, 'getStorageStates'>;
  targets?: Pick<PlaybackTargetService, 'forEpisode' | 'forMovie'>;
  sourceHealth?: Pick<SourceHealthService, 'hasFailed'>;
}

/** Shared inline preparation seam for focus, details, and Watch. */
export class PlayablePreparationService {
  private readonly mediaService: MediaService;
  private readonly sourceService: SourceService;
  private readonly warmup?: SourceWarmupController;
  private readonly storage?: Pick<MediaLoadClientService, 'getStorageStates'>;
  private readonly targets?: Pick<PlaybackTargetService, 'forEpisode' | 'forMovie'>;
  private readonly sourceHealth?: Pick<SourceHealthService, 'hasFailed'>;

  constructor({
    mediaService,
    sourceService,
    warmup,
    storage,
    targets,
    sourceHealth,
  }: PlayablePreparationServiceOptions) {
    this.mediaService = mediaService;
    this.sourceService = sourceService;
    this.warmup = warmup;
    this.storage = storage;
    this.targets = targets;
    this.sourceHealth = sourceHealth;
  }

  private readonly episodeFileSizeCache = new Map<string, number | null>();

  /**
   * Prepare a playable through catalog lookup, source discovery, metadata resolution, or payload warmup.
   * Missing catalog data and empty source lists return a cold result with no source.
   * Completed local downloads take priority over fresh torrents, unless they exceed the client's
   * bitrate cap. Quality ranks copies within that group; HEVC compatibility still applies. With
   * a bitrate cap, copies within it rank first and the rest follow from the leanest (episodes by
   * their own file in a pack, against the show's typical episode length). workClass sets the discovery wait budget.
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

    const avoid = (list: ContentSource[]) =>
      options.avoidSourceIds?.length
        ? list.filter(source => !options.avoidSourceIds!.includes(source.id))
        : list;
    let sources = await this.sourceService
      .getSourcesForMovieWithOnDemandSearch(
        {
          id: media.local.id,
          mediaId: media.local.mediaId,
          releaseDate: media.local.releaseDate,
          imdbId: media.local.imdbId,
          title: media.local.title,
          contentDirectoriesSearched: media.local.contentDirectoriesSearched,
        },
        options.workClass === 'interactive' ? 3_000 : 500
      )
      .then(avoid);
    this.throwIfAborted(options.signal);
    if (!sources.length) {
      return { playable, source: null, target: null, state: 'cold', warmup: emptyWarmup() };
    }
    if (!sources.some(isUsableSource)) return exhausted(playable);
    if (!sources.some(source => source.hasVideo === true)) {
      // Nothing verified yet: check the candidates in the background, well before Watch.
      this.sourceService.requestMovieVerification(media.local.id, 10);
    }
    const candidates = filterVideoCodecSources(sources, options.preferences);
    // An unreachable engine has no local copy to offer: fall back to the swarm.
    const stored = this.storage
      ? await this.storage.getStorageStates(candidates.map(source => source.id)).catch(() => [])
      : [];
    const complete = new Set(
      stored
        .filter(state => state.videoComplete || state.localOnly || state.downloaded >= 10000)
        .map(state => state.sourceId)
    );
    const completedSources = candidates.filter(source => complete.has(source.id));
    this.throwIfAborted(options.signal);
    const runtimeSeconds = media.local.runtime > 0 ? media.local.runtime * 60 : undefined;
    const bitrate = runtimeSeconds ? { runtimeSeconds } : undefined;
    const { maxBitrateKbps } = options.preferences;
    // A finished download over the client's bitrate cap would stall it; fetch a leaner one.
    const localSource = this.select(
      completedSources.filter(
        source =>
          !maxBitrateKbps || !runtimeSeconds || fitsBitrate(source, maxBitrateKbps, runtimeSeconds)
      ),
      options.preferences,
      false,
      bitrate
    );
    const usableSource = localSource ?? this.select(sources, options.preferences, true, bitrate);
    if (options.through === 'sources') {
      const source = usableSource ?? this.select(sources, options.preferences, false, bitrate);
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
    // A source can turn out to hold no video (a fake torrent); try the next candidates.
    const finishMovie = async (first: ContentSource): Promise<PreparedPlayable> => {
      const tried = new Set<number>();
      let source = first;
      for (;;) {
        tried.add(source.id);
        this.reportAttempt(sources, source, options);
        const result = await this.finish(playable, source, options, movieTarget);
        const rejected = source.hasVideo === false || this.sourceHealth?.hasFailed(source.id);
        if (result.target || !rejected) return result;
        if (!sources.some(isUsableSource)) return exhausted(playable);
        if (tried.size >= MAX_SOURCE_ATTEMPTS) return result;
        const next = this.select(
          sources.filter(candidate => !tried.has(candidate.id)),
          options.preferences,
          false,
          bitrate
        );
        if (!next || this.sourceHealth?.hasFailed(next.id)) return result;
        source = next;
      }
    };
    if (usableSource) {
      return finishMovie(usableSource);
    }

    let fallbackSource = this.select(sources, options.preferences, false, bitrate);
    const metadataCandidates = this.sortCandidates(sources, options.preferences, false, bitrate)
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
      sources = avoid(await this.sourceService.getSourcesForMovie(media.local.id));
      const selected = this.select(sources, options.preferences, true, bitrate);
      if (selected) {
        return finishMovie(selected);
      }
      fallbackSource = this.select(sources, options.preferences, false, bitrate);
    }

    if (fallbackSource && options.through === 'warm') {
      return finishMovie(fallbackSource);
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
      showTmdbId: show.local.mediaId,
      showYear: show.local.firstAirDate ? Number(show.local.firstAirDate.slice(0, 4)) : null,
      showImdbId: show.local.imdbId ?? null,
      seasonNumber: playable.seasonNumber,
      episodeNumber: playable.episodeNumber,
      providerSeasonNumber: episode.providerSeasonNumber,
      providerEpisodeNumber: episode.providerEpisodeNumber,
      airDate: episode.airDate,
    });
    this.throwIfAborted(options.signal);
    const compatible = matches.filter(
      match =>
        match.videoFilePath &&
        !options.avoidSourceIds?.includes(match.source.id) &&
        filterVideoCodecSources([match.source], options.preferences).length
    );
    if (compatible.length && !compatible.some(match => isUsableSource(match.source)))
      return exhausted(playable);
    const runtimeMinutes = show.local.episodeRuntime;
    const bitrate: BitrateBudget | undefined =
      options.preferences.maxBitrateKbps && runtimeMinutes
        ? { runtimeSeconds: runtimeMinutes * 60, sizeOf: await this.episodeFileSizes(compatible) }
        : undefined;
    this.throwIfAborted(options.signal);
    const tried = new Set<number>();
    // The last attempt's result, so running out of candidates still reports the source tried.
    let lastResult: PreparedPlayable | null = null;
    for (;;) {
      const candidates = compatible.filter(
        match => !tried.has(match.source.id) && isUsableSource(match.source)
      );
      const exactCandidates = candidates.filter(match => match.matchKind === 'single');
      const usableCandidates = exactCandidates.length ? exactCandidates : candidates;
      const selected = this.select(
        usableCandidates.map(match => match.source),
        options.preferences,
        false,
        bitrate
      );
      const match = usableCandidates.find(candidate => candidate.source.id === selected?.id);
      if (!selected || !match) {
        if (tried.size && !compatible.some(item => isUsableSource(item.source)))
          return exhausted(playable);
        return (
          lastResult ?? {
            playable,
            source: null,
            target: null,
            state: 'cold',
            warmup: emptyWarmup(),
          }
        );
      }
      tried.add(selected.id);
      const target: PlaybackTarget = {
        source: selected,
        filePath: match.videoFilePath!,
        matchKind: match.matchKind,
      };
      options.onSourceSelected?.(selected);
      if (options.through === 'sources')
        return { playable, source: selected, target, state: 'metadata', warmup: emptyWarmup() };
      this.reportAttempt(
        compatible.map(item => item.source),
        selected,
        options
      );
      const result = await this.finish(playable, selected, options, async () =>
        this.targets ? this.targets.forEpisode(match) : target
      );
      lastResult = result;
      const rejected = selected.hasVideo === false || this.sourceHealth?.hasFailed(selected.id);
      if (result.target || !rejected || tried.size >= MAX_SOURCE_ATTEMPTS) {
        if (!result.target && !compatible.some(item => isUsableSource(item.source)))
          return exhausted(playable);
        return result;
      }
    }
  }

  /** Tell the caller which candidate is tried, counting the ones already ruled out. */
  private reportAttempt(
    sources: ContentSource[],
    source: ContentSource,
    options: PreparationOptions
  ): void {
    if (!options.onSourceAttempt) return;
    const compatible = filterVideoCodecSources([...sources], options.preferences);
    const ruledOut = compatible.filter(
      candidate =>
        candidate.id !== source.id &&
        (!isUsableSource(candidate) || this.sourceHealth?.hasFailed(candidate.id))
    ).length;
    const total = Math.max(compatible.length, ruledOut + 1);
    options.onSourceAttempt({ sourceId: source.id, position: ruledOut + 1, total });
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
      logger.warn(
        'PlayablePreparationService',
        `Source ${source.id} file could not be resolved`,
        error
      );
      // Without the source's file list nothing can be warmed or played yet.
      return { playable, source, target: null, state: 'cold', warmup: emptyWarmup('failed') };
    }
    this.throwIfAborted(options.signal);
    if (!this.warmup || !target || options.resolveOnly) {
      return { playable, source, target, state: 'cold', warmup: emptyWarmup() };
    }
    let slot: Awaited<ReturnType<SourceWarmupController['warm']>>;
    try {
      slot = await this.warmup.warm(
        target,
        options.ownerKey ?? playableKey(playable),
        playableKey(playable),
        {
          ...(options.preferences.subtitleLanguage
            ? { subtitleLanguage: options.preferences.subtitleLanguage }
            : {}),
          ...(options.resumeFraction ? { startFraction: options.resumeFraction } : {}),
        }
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

  /** `bitrate`, the playable's runtime and size, lets the client's bitrate cap rank them. */
  private select(
    sources: ContentSource[],
    preferences: PlaybackPreferences,
    requireFile = true,
    bitrate?: BitrateBudget
  ): ContentSource | null {
    const compatible = this.sortCandidates(sources, preferences, requireFile, bitrate);
    if (!compatible.length) return null;
    if (preferences.quality === 'auto') return compatible[0];
    // The bitrate cap outranks the requested quality: an over-cap match would stall playback.
    const maxBitrateKbps = preferences.maxBitrateKbps;
    const withinCap =
      maxBitrateKbps && bitrate
        ? compatible.filter(source =>
            fitsBitrate(source, maxBitrateKbps, bitrate.runtimeSeconds, bitrate.sizeOf)
          )
        : [];
    const capped = withinCap.length ? withinCap : compatible;
    // The requested quality is looked for among releases in the viewer's language first.
    const understood = capped.filter(
      source => !madeForOtherLanguage(source, viewerLanguages(preferences))
    );
    const pool = understood.length ? understood : capped;
    return (
      pool.find(source => source.quality?.toLowerCase() === preferences.quality.toLowerCase()) ??
      compatible[0]
    );
  }

  private sortCandidates(
    sources: ContentSource[],
    preferences: PlaybackPreferences,
    requireFile: boolean,
    bitrate?: BitrateBudget
  ): ContentSource[] {
    const compatible = requireFile
      ? filterSources([...sources], preferences)
      : filterVideoCodecSources([...sources], preferences).sort(byPlaybackRank());
    // Known fakes are never picked. A source that failed during playback is skipped while any
    // other candidate remains.
    const real = compatible.filter(isUsableSource);
    const healthy = real.filter(source => !this.sourceHealth?.hasFailed(source.id));
    const ranked = healthy.length ? healthy : real;
    // A release made for another language's market (a French dub) plays last, whatever its
    // quality or bitrate: the viewer may not understand it.
    return viewerLanguageFirst(
      preferences.maxBitrateKbps && bitrate
        ? preferWithinBitrate(
            ranked,
            preferences.maxBitrateKbps,
            bitrate.runtimeSeconds,
            bitrate.sizeOf
          )
        : ranked,
      viewerLanguages(preferences)
    );
  }

  /**
   * Each candidate's episode file size, from its torrent file; null while the torrent is unknown.
   * A season pack's size is the whole season, so it cannot stand for the episode.
   */
  private async episodeFileSizes(matches: EpisodeSource[]): Promise<PlayedSize> {
    const sizes = new Map<number, number | null>();
    for (const match of matches) {
      const key = `${match.source.id}:${match.videoFilePath ?? ''}`;
      let size = this.episodeFileSizeCache.get(key);
      if (size === undefined && match.source.file) {
        try {
          const files = (await parseTorrent(match.source.file)).files ?? [];
          const videos = files.filter(file => isVideoFile(file.path));
          const exact = match.videoFilePath
            ? files.find(item => item.path === match.videoFilePath)
            : undefined;
          // A provider-relative path lacks the torrent's root folder; only a unique suffix counts.
          const suffixed = match.videoFilePath
            ? files.filter(item => item.path.endsWith('/' + match.videoFilePath))
            : [];
          const file = match.videoFilePath
            ? (exact ?? (suffixed.length === 1 ? suffixed[0] : undefined))
            : videos.length === 1
              ? videos[0]
              : undefined;
          size = file?.length ?? null;
        } catch {
          size = null;
        }
        if (this.episodeFileSizeCache.size >= EPISODE_FILE_SIZES_LIMIT)
          this.episodeFileSizeCache.clear();
        this.episodeFileSizeCache.set(key, size);
      }
      sizes.set(match.source.id, size ?? null);
    }
    return source => sizes.get(source.id) ?? null;
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new DOMException('Preparation cancelled', 'AbortError');
  }
}

/** Every source found for the playable proved fake. */
function exhausted(playable: PlayableRef): PreparedPlayable {
  return {
    playable,
    source: null,
    target: null,
    state: 'cold',
    warmup: emptyWarmup(),
    exhausted: true,
  };
}

/** Create a warmup snapshot with zero measured progress and byte counts. */
function emptyWarmup(state: PreloadWarmupState = 'not_requested'): PreloadWarmupSnapshot {
  return { state, progress: 0, verifiedBytes: 0, targetBytes: 0 };
}

function playableKey(playable: PlayableRef): string {
  if (playable.kind === 'movie') return `m:${playable.mediaId}`;
  return `e:${playable.showMediaId}:${playable.seasonNumber}:${playable.episodeNumber}`;
}
