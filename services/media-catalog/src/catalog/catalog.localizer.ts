import type { EpisodeRow, MovieRow, SeasonRow, TVShowRow } from '../db/catalog-db.types';
import { LocalizationRepository } from '../db/localization.repo';
import { TVShowRepository } from '../db/tv-show.repo';
import { logger } from '../logger';
import type { CatalogProvider } from '../provider/provider';
import type { EpisodeDetail, MovieDetail, SeasonDetail, TVShowDetail } from '../types';

const SCOPE = 'CatalogLocalizer';
const DEFAULT_LANGUAGE = 'en';

/** Translates persisted rows and maps them to the catalog HTTP contract. */
export class CatalogLocalizer {
  constructor(
    private readonly localization: LocalizationRepository,
    private readonly tvShows: TVShowRepository,
    private readonly provider: CatalogProvider
  ) {}

  async localizeMovie(row: MovieRow, language: string): Promise<MovieDetail> {
    await this.ensureGenreTranslations(
      this.localization.genreIdsOf('movie', row.media_id),
      language
    );
    const translation = this.translationFor('movie', row.media_id, language);
    return {
      mediaType: 'movie',
      mediaId: row.media_id,
      imdbId: row.imdb_id,
      title: translation.title || row.title,
      overview: translation.overview || row.overview,
      tagline: translation.tagline || row.tagline,
      releaseDate: row.release_date,
      runtime: row.runtime,
      poster: row.poster,
      backdrop: row.backdrop,
      logo: row.logo,
      genres: this.localization.localizedGenreNames(
        'movie',
        row.media_id,
        language,
        DEFAULT_LANGUAGE
      ),
      popularity: row.popularity,
      rating: row.rating,
      detailsSyncedAt: row.details_synced_at ? new Date(row.details_synced_at).toISOString() : null,
    };
  }

  async localizeTVShow(row: TVShowRow, language: string): Promise<TVShowDetail> {
    await this.ensureGenreTranslations(this.localization.genreIdsOf('tv', row.media_id), language);
    const translation = this.translationFor('tv', row.media_id, language);
    return {
      mediaType: 'tv',
      mediaId: row.media_id,
      imdbId: row.imdb_id,
      name: translation.title || row.name,
      overview: translation.overview || row.overview,
      tagline: translation.tagline || row.tagline,
      firstAirDate: row.first_air_date,
      status: row.status,
      type: row.type,
      inProduction: row.in_production === 1,
      episodeRunTime: JSON.parse(row.episode_run_time) as number[],
      poster: row.poster,
      backdrop: row.backdrop,
      logo: '',
      genres: this.localization.localizedGenreNames('tv', row.media_id, language, DEFAULT_LANGUAGE),
      popularity: row.popularity,
      rating: row.rating,
      seasons: this.tvShows.getSeasonsOf(row.media_id).map(season => this.seasonSummary(season)),
      detailsSyncedAt: row.details_synced_at ? new Date(row.details_synced_at).toISOString() : null,
    };
  }

  localizeSeason(season: SeasonRow, episodes: EpisodeRow[], _language: string): SeasonDetail {
    return {
      tvMediaId: season.tv_media_id,
      seasonMediaId: season.media_id,
      seasonNumber: season.season_number,
      name: season.name,
      overview: season.overview,
      airDate: season.air_date,
      poster: season.poster,
      synced: season.synced === 1,
      episodes: episodes.map(
        (episode): EpisodeDetail => ({
          mediaId: episode.media_id,
          episodeNumber: episode.episode_number,
          name: episode.name,
          overview: episode.overview,
          airDate: episode.air_date,
          still: episode.still,
        })
      ),
    };
  }

  private async ensureGenreTranslations(genreIds: number[], language: string): Promise<void> {
    if (genreIds.length === 0 || this.localization.genresCoverLanguage(genreIds, language)) return;
    try {
      const genres = await this.provider.getGenres(language);
      this.localization.upsertGenres(genres, language);
    } catch (error) {
      logger.warn(SCOPE, `Genre translation fetch for '${language}' failed`, error);
    }
  }

  private translationFor(
    entityType: 'movie' | 'tv',
    entityId: number,
    language: string
  ): { title?: string; overview?: string; tagline?: string } {
    return (
      this.localization
        .getTranslations(entityType, entityId)
        .find(row => row.language === language) ?? {}
    );
  }

  private seasonSummary(season: SeasonRow) {
    return {
      mediaId: season.media_id,
      seasonNumber: season.season_number,
      name: season.name,
      overview: season.overview,
      airDate: season.air_date,
      poster: season.poster,
      episodeCount: this.tvShows.episodeCount(season.media_id),
      synced: season.synced === 1,
    };
  }
}
