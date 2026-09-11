import type { EpisodeRow, MovieRow, SeasonRow, TVShowRow } from './catalog-db.types';
import { episodes, movies, seasons, tvShows } from './schema';

export const movieRow = (row: typeof movies.$inferSelect): MovieRow => ({
  media_id: row.mediaId,
  imdb_id: row.imdbId,
  title: row.title,
  overview: row.overview,
  tagline: row.tagline,
  release_date: row.releaseDate,
  runtime: row.runtime,
  poster: row.poster,
  backdrop: row.backdrop,
  logo: row.logo,
  popularity: row.popularity,
  rating: row.rating,
  details_synced_at: row.detailsSyncedAt,
});

export const showRow = (row: typeof tvShows.$inferSelect): TVShowRow => ({
  media_id: row.mediaId,
  imdb_id: row.imdbId,
  name: row.name,
  overview: row.overview,
  tagline: row.tagline,
  first_air_date: row.firstAirDate,
  poster: row.poster,
  backdrop: row.backdrop,
  status: row.status,
  type: row.type,
  in_production: row.inProduction,
  episode_run_time: row.episodeRunTime,
  popularity: row.popularity,
  rating: row.rating,
  details_synced_at: row.detailsSyncedAt,
});

export const seasonRow = (row: typeof seasons.$inferSelect): SeasonRow => ({
  media_id: row.mediaId,
  tv_media_id: row.tvMediaId,
  season_number: row.seasonNumber,
  name: row.name,
  overview: row.overview,
  air_date: row.airDate,
  poster: row.poster,
  synced: row.synced,
  episodes_synced_at: row.episodesSyncedAt,
});

export const episodeRow = (row: typeof episodes.$inferSelect): EpisodeRow => ({
  media_id: row.mediaId,
  season_media_id: row.seasonMediaId,
  episode_number: row.episodeNumber,
  name: row.name,
  overview: row.overview,
  air_date: row.airDate,
  still: row.still,
});
