import { VideoSource } from './app/jackett/jackett.types';
import { MoviesImages } from './app/movies/movies.types';
import { VideoCodec, VideoQuality } from '@miauflix/types';

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
  index: number; // index of the title in the list ( the UI will display the first 5 titles before the user has to scroll to see more, so those are more important )
  slug: string;
  images: MoviesImages;
};

/** Jackett Q */

export const enum jackettJobs {
  searchMovie = 'searchMovie',
  populateTorrentQForMovie = 'populateTorrentQForMovie',
}

export interface SearchMovieData {
  index: number; // index of the title in the list
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
  index: number; // index of the title in the list
  movieId: number;
}

/** Torrent Q */

export const enum torrentJobs {
  getTorrentFile = 'getTorrentFile',
}

export interface GetTorrentFileData {
  index: number; // index of the title in the list
  count: number; // count of the torrent for the title, we want to find at least 1 torrent for each title as fast as possible, so the count is important
  id: number;
  movieId: number;
  quality: VideoQuality;
  codec: VideoCodec;
  source: VideoSource;
  runtime: number;
  url: string;
}
