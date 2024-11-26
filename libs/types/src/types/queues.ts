import { MediaImages } from './media';

export const enum queues {
  deviceCode = 'deviceCode',
  movie = 'movie',
  jackett = 'jackett',
  torrentOrchestrator = 'torrentOrchestrator',
  torrent = 'torrent',
  show = 'show',
}

/** Device Code Q */

export const enum deviceCodeJobs {
  checkForAccessToken = 'checkForAccessToken',
}

export type CheckForAccessTokenData = string;

/** Movie Q */

export const enum movieJobs {
  getMovieExtendedData = 'getMovieExtendedData',
  searchImagesForMovie = 'searchImagesForMovie',
}

export type GetMovieExtendedDataData = {
  index: number; // index of the title in the list ( the UI will display the first 5 titles before the user has to scroll to see more, so those are more important )
  slug: string;
  images: MediaImages;
  priority?: number;
};

export type SearchImagesForMovieData = {
  slug: string;
};

/** Show Q */

export const enum showJobs {
  getShowExtendedData = 'getShowExtendedData',
  getShowEpisodes = 'getShowEpisodes',
  searchImagesForShow = 'searchImagesForShow',
}

export type GetShowExtendedDataData = {
  index: number; // index of the title in the list ( the UI will display the first 5 titles before the user has to scroll to see more, so those are more important )
  slug: string;
  images: MediaImages;
  priority?: number;
};

export type SearchImagesForShowData = {
  slug: string;
};

export type GetShowEpisodesData = {
  slug: string;
};

/** Jackett Q */

export const enum jackettJobs {
  searchMovie = 'searchMovie',
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

/** Torrent OQ */

export const enum torrentOrchestratorJobs {
  populateTorrentQForMovie = 'populateTorrentQForMovie',
  changePriorityForMovie = 'changePriorityForMovie',
}

export interface PopulateTorrentQForMovieData {
  index: number; // index of the title in the list
  movieId: number;
  priority?: number;
}
export interface ChangePriorityForMovieData {
  priority: number;
  movieId: number;
}

/** Torrent Q */

export const enum torrentJobs {
  getTorrentFile = 'getTorrentFile',
}

export interface GetTorrentFileData {
  movieId: number;
  runtime: number;
  highQuality: boolean;
  hevc: boolean;
}
