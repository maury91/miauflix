import type { ContentSource } from '@entities/content-source.entity';
import type { PlayableRef } from '@mytypes/playable.types';
import type { EpisodeSourceRepository } from '@repositories/episode-source.repository';
import type { MediaProbeRepository } from '@repositories/media-probe.repository';
import type { MediaService } from '@services/media/media.service';
import type { SourceService } from '@services/source/source.service';
import { isUsableSource } from '@services/source/source-availability.service';
import { releaseLanguageCode } from '@utils/release-language.util';

import type { ProbeResult } from './audio-playback.service';

/** An audio track of a source's file, as its probe gives it. */
export interface AudioSourceTrack {
  /** The track's language tag (`ita`, `en`); null when the file gives none. */
  language: string | null;
  title: string | null;
  codec: string | null;
  channels: number | null;
}

/** A source of a playable, with what is known about the languages it plays in. */
export interface AudioSourceDto {
  id: number;
  quality: ContentSource['quality'];
  sourceType: ContentSource['sourceType'];
  videoCodec: ContentSource['videoCodec'];
  size: number;
  broadcasters: number | null;
  /** The languages its release name gives (ISO 639-1); empty when it names none. */
  releaseLanguages: string[];
  /** Its file's audio tracks, once the file was probed; null before. */
  audioTracks: AudioSourceTrack[] | null;
}

export interface AudioSourcesResponse {
  sources: AudioSourceDto[];
}

type Searcher = Pick<
  SourceService,
  'getSourcesForEpisodeWithOnDemandSearch' | 'getSourcesForMovie' | 'searchMovieSourcesInLanguage'
>;

/**
 * The sources a playable is known to have, with their languages (from the release name and,
 * once probed, the file's audio tracks), and searches for its releases in another language.
 */
export class AudioSourcesService {
  constructor(
    private readonly media: Pick<
      MediaService,
      'getMovieByMediaId' | 'getSeason' | 'getTVShowByMediaId'
    >,
    private readonly sources: Searcher,
    private readonly episodeSources: Pick<EpisodeSourceRepository, 'findByEpisodeId'>,
    private readonly probes: Pick<MediaProbeRepository, 'findBySourceIds'>
  ) {}

  /** The playable's known sources: those that may hold video, the best swarm first. */
  async list(playable: PlayableRef): Promise<AudioSourcesResponse> {
    return this.describe(await this.find(playable));
  }

  /** Look for the playable's releases in `language` (ISO 639-1), then list its sources. */
  async search(playable: PlayableRef, language: string): Promise<AudioSourcesResponse> {
    return this.describe(await this.find(playable, language));
  }

  private async find(
    playable: PlayableRef,
    language?: string
  ): Promise<Array<{ source: ContentSource; filePath?: string }>> {
    if (playable.kind === 'movie') {
      const movie = await this.media.getMovieByMediaId(playable.mediaId);
      if (!movie) return [];
      const sources = language
        ? await this.sources.searchMovieSourcesInLanguage(movie.local.id, language)
        : await this.sources.getSourcesForMovie(movie.local.id);
      return sources.map(source => ({ source }));
    }
    const show = await this.media.getTVShowByMediaId(playable.showMediaId);
    if (!show) return [];
    const season = await this.media.getSeason(playable.showMediaId, playable.seasonNumber);
    const episode = season?.episodes.find(item => item.episodeNumber === playable.episodeNumber);
    if (!episode) return [];
    const matches = language
      ? await this.sources.getSourcesForEpisodeWithOnDemandSearch({
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
          language,
        })
      : await this.episodeSources.findByEpisodeId(episode.id);
    return matches
      .filter(match => match.source && match.videoFilePath)
      .map(match => ({ source: match.source, filePath: match.videoFilePath ?? undefined }));
  }

  private async describe(
    found: Array<{ source: ContentSource; filePath?: string }>
  ): Promise<AudioSourcesResponse> {
    const usable = found.filter(({ source }) => isUsableSource(source));
    const probes = await this.probes
      .findBySourceIds(usable.map(({ source }) => source.id))
      .catch(() => []);
    const seen = new Set<number>();
    const sources = usable
      .filter(({ source }) => !seen.has(source.id) && seen.add(source.id))
      .sort((left, right) => (right.source.broadcasters ?? 0) - (left.source.broadcasters ?? 0))
      .map(({ source, filePath }): AudioSourceDto => {
        // An episode's own file; a movie's main video, the only file playback probes
        const probe = probes.find(
          item => item.sourceId === source.id && (!filePath || item.filePath === filePath)
        );
        return {
          id: source.id,
          quality: source.quality,
          sourceType: source.sourceType,
          videoCodec: source.videoCodec,
          size: source.size,
          broadcasters: source.broadcasters ?? null,
          releaseLanguages: [
            ...new Set(
              (source.languages ?? []).flatMap(language => releaseLanguageCode(language) ?? [])
            ),
          ],
          audioTracks: probe ? audioTracksOf(probe.result) : null,
        };
      });
    return { sources };
  }
}

function audioTracksOf(result: string): AudioSourceTrack[] | null {
  try {
    const probe = JSON.parse(result) as ProbeResult;
    return (probe.streams ?? [])
      .filter(stream => stream.codec_type === 'audio')
      .map(stream => ({
        language: stream.tags?.language ?? null,
        title: stream.tags?.title ?? null,
        codec: stream.codec_name ?? null,
        channels: stream.channels ?? null,
      }));
  } catch {
    return null;
  }
}
