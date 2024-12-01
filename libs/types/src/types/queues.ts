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
  searchShowEpisode = 'searchShowEpisode',
}

export interface SearchMovieData {
  index: number; // index of the title in the list
  movieSlug: string;
  params: {
    q: string;
    year: string;
    traktid: string;
    imdbid: string;
    tmdbid: string;
  };
}

export interface SearchShowEpisodeData {
  showSlug: string;
  showId: number;
  seasonId: number;
  episodeId: number;
  season: number;
  episode: number;
  params: {
    q: string;
    year: string;
    season: string;
    ep: string;
    traktid: string;
    imdbid: string;
    tvdbid: string;
    tmdbid: string;
  };
}

/** Torrent OQ */

export const enum torrentOrchestratorJobs {
  populateTorrentQForMedia = 'populateTorrentQForMedia',
  changePriorityForMedia = 'changePriorityForMedia',
}

export interface PopulateTorrentQForMediaData {
  index: number; // index of the title in the list
  mediaId: number;
  mediaType: 'movie' | 'episode';
  priority?: number;
}

export interface ChangePriorityForMediaData {
  priority: number;
  mediaId: number;
  mediaType: 'movie' | 'episode';
}

/** Torrent Q */

export const enum torrentJobs {
  getTorrentFile = 'getTorrentFile',
}

export interface GetTorrentFileData {
  mediaId: number;
  mediaType: 'movie' | 'episode';
  runtime: number;
  highQuality: boolean;
  hevc: boolean;
}
