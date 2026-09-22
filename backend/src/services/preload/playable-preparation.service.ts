import type { Quality } from '@miauflix/source-metadata-extractor';

import type { MovieSource } from '@entities/movie-source.entity';
import type { PlayableRef } from '@routes/playable.types';
import type { MediaService } from '@services/media/media.service';
import type { SourceService } from '@services/source/source.service';

import type { TorrentWarmupController } from './torrent-warmup.controller';

export interface PlaybackPreferences {
  quality: Quality | 'auto';
  allowHevc: boolean;
}

export interface PreparedPlayable {
  playable: PlayableRef;
  source: MovieSource | null;
  state: 'cold' | 'metadata' | 'ready' | 'warming';
}

export interface PreparationOptions {
  through: 'catalog' | 'metadata' | 'sources' | 'warm';
  preferences: PlaybackPreferences;
  workClass: 'background' | 'interactive';
  ownerKey?: string;
  signal?: AbortSignal;
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
      return { playable, source: null, state: 'cold' };
    }

    this.throwIfAborted(options.signal);
    const media = await this.mediaService.getMovieByMediaId(playable.mediaId);
    this.throwIfAborted(options.signal);
    if (!media) return { playable, source: null, state: 'cold' };
    if (options.through === 'catalog') {
      return { playable, source: null, state: 'metadata' };
    }

    let sources = await this.sourceService.getSourcesForMovieWithOnDemandSearch(
      {
        id: media.local.id,
        imdbId: media.local.imdbId,
        title: media.local.title,
        contentDirectoriesSearched: media.local.contentDirectoriesSearched,
      },
      options.workClass === 'interactive' ? 1_200 : 500
    );
    this.throwIfAborted(options.signal);
    if (!sources.length) return { playable, source: null, state: 'cold' };
    if (options.through === 'sources') {
      return { playable, source: this.select(sources, options.preferences), state: 'metadata' };
    }

    for (const source of sources.slice(0, 2)) {
      this.throwIfAborted(options.signal);
      if (!source.file) {
        await this.sourceService.processSourceMetadata(source.id);
        this.throwIfAborted(options.signal);
      }
      sources = await this.sourceService.getSourcesForMovie(media.local.id);
      const selected = this.select(sources, options.preferences);
      if (selected?.file) {
        return this.finish(playable, selected, options);
      }
    }

    return { playable, source: this.select(sources, options.preferences), state: 'metadata' };
  }

  private async finish(
    playable: PlayableRef,
    source: MovieSource,
    options: PreparationOptions
  ): Promise<PreparedPlayable> {
    if (options.through !== 'warm' || !this.warmup) {
      return { playable, source, state: 'ready' };
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
      return { playable, source, state: 'ready' };
    }
    if (options.signal?.aborted) {
      await this.warmup.pause(options.ownerKey ?? playableKey(playable));
      this.throwIfAborted(options.signal);
    }
    return { playable, source, state: slot.state === 'ready' ? 'ready' : 'warming' };
  }

  private select(sources: MovieSource[], preferences: PlaybackPreferences): MovieSource | null {
    const compatible = preferences.allowHevc
      ? sources
      : sources.filter(source => !source.videoCodec?.toLowerCase().includes('265'));
    if (!compatible.length) return null;
    if (preferences.quality === 'auto') return compatible[0];
    return (
      compatible.find(
        source => source.quality?.toLowerCase() === preferences.quality.toLowerCase()
      ) ?? compatible[0]
    );
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new DOMException('Preparation cancelled', 'AbortError');
  }
}

function playableKey(playable: PlayableRef): string {
  if (playable.kind === 'movie') return `m:${playable.mediaId}`;
  return `e:${playable.showMediaId}:${playable.seasonNumber}:${playable.episodeNumber}`;
}
