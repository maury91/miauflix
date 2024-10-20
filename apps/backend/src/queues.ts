import { VideoQuality } from './app/jackett/jackett.types';
import { MoviesImages } from './app/movies/movies.types';

export const enum queues {
  deviceCode = 'deviceCode',
  movie = 'movie',
  jackett = 'jackett',
  torrent = 'torrent',
}

/** Device Code Q */

export const enum deviceCodeJobs {
  checkForAccessToken = 'checkForAccessToken',
}

export type CheckForAccessTokenData = string;

/** Movie Q */

export const enum movieJobs {
  getMovieExtendedData = 'getMovieExtendedData',
}

export type GetMovieExtendedDataData = {
  slug: string;
  images: MoviesImages;
};

/** Jackett Q */

export const enum jackettJobs {
  searchMovie = 'searchMovie',
  populateTorrentQForMovie = 'populateTorrentQForMovie',
}

export interface SearchMovieData {
  movieId: number;
  params: {
    q: string;
    year: string;
    traktid: string;
    imdbid: string;
    tmdbid: string;
  };
}

export interface PopulateTorrentQForMovieData {
  movieId: number;
}

/** Torrent Q */

export const enum torrentJobs {
  getTorrentFile = 'getTorrentFile',
}

export interface GetTorrentFileData {
  id: number;
  movieId: number;
  quality: VideoQuality;
  runtime: number;
  url: string;
}
