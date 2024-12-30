import { VideoCodec, VideoQuality } from '@miauflix/types';

type MaybeArray<T> = T | T[];

interface JackettIndexerSearchInfo {
  available: 'yes' | 'no';
  supportedParams: string; // comma separated
  searchEngine: 'raw' | string;
}

interface JackettIndexerCategory {
  id: string; // number format
  name: string;
}

interface JackettIndexerCategoryWithSubcategories
  extends JackettIndexerCategory {
  subcat: JackettIndexerCategory | JackettIndexerCategory[];
}

export interface JackettIndexer {
  id: string;
  configured: 'true' | 'false';
  title: string;
  description: string;
  link: string;
  language: string;
  type: 'public' | 'private';
  caps: {
    server: {
      title: string;
    };
    limits: {
      default: string;
      max: string;
    };
    searching: {
      search: JackettIndexerSearchInfo;
      'tv-search': JackettIndexerSearchInfo;
      'movie-search': JackettIndexerSearchInfo;
      'music-search': JackettIndexerSearchInfo;
      'audio-search': JackettIndexerSearchInfo;
      'book-search': JackettIndexerSearchInfo;
    };
    categories: {
      category: (
        | JackettIndexerCategory
        | JackettIndexerCategoryWithSubcategories
      )[];
    };
  };
}

export interface JackettIndexersResponse {
  indexers: {
    indexer: JackettIndexer[];
  };
}

export type VideoSource =
  | 'Blu-ray'
  | 'WEB'
  | 'HDTV'
  | 'DVD'
  | 'TS'
  | 'Cam'
  | 'unknown';

export interface JackettQueryResponse {
  rss: {
    version: string;
    'xmlns:atom': string;
    'xmlns:torznab': string;
    channel: {
      'atom:link': {
        href: string;
        rel: string;
        type: string;
      };
      title: string;
      description: string;
      link: string;
      language: string;
      category: string;
      item: MaybeArray<JackettQueryItem>;
    };
  };
}

export interface JackettQueryItem {
  title: string;
  guid: string;
  jackettindexer: {
    id: string;
    _text: string;
  };
  type: 'public' | 'private';
  comments: string;
  pubDate: string;
  size: number;
  description: null | string;
  link: string;
  category: MaybeArray<number>;
  enclosure: {
    url: string;
    length: string;
    type: 'application/x-bittorrent' | string;
  };
  'torznab:attr': {
    name: string;
    value: string;
  }[];
}

interface TorrentUrl {
  url: string;
  type: string;
}

export interface Torrent {
  title: string;
  guid: string;
  isPrivate: boolean;
  pubDate: Date;
  size: number;
  category: number[];
  urls: TorrentUrl[];
  codec: VideoCodec;
  source: VideoSource;
  seeders: number; // Users that has all the torrent
  peers: number; // Users that has part of it
  quality: VideoQuality;
  episode: number | undefined;
  season: number | undefined;
  mediaName: string;
  mediaYear: number | undefined;
  type: 'tv' | 'movie' | 'anime';
  infoHash: string;
  imdb: string;
}

export interface JackettTracker {
  id: string;
  title: string;
  description: string;
  language: string;
  isPrivate: boolean;
  maxLimit: number;
  defaultLimit: number;
  categories: Record<'anime' | 'movie' | 'tv', { id: number; name: string }[]>;
  searching: Record<
    SearchType,
    { available: boolean; supportedParams: string[] }
  >;
}

export interface JackettSimplifiedTracker
  extends Pick<JackettTracker, 'id' | 'title' | 'maxLimit' | 'defaultLimit'> {
  categories: number[];
  search: JackettTracker['searching']['search'];
  tvSearch: JackettTracker['searching']['tvSearch'];
  movie: JackettTracker['searching']['movie'];
}

export type JackettAllTrackerResponse = JackettTracker[];
export type CategoryType = 'movie' | 'tv' | 'anime';
export type SearchType = 'search' | 'tvSearch' | 'movie';

export interface QueryParamsArgs {
  search: {
    q: string;
  };
  anime: {
    // same as TV for now
    q: string;
    season?: string; // tv
    ep?: string; // tv
    imdbid?: string; // tv, movie
    tvdbid?: string; // tv
    rid?: string; // tv
    tmdbid?: string; // tv, movie
    tvmazeid?: string; // tv
    traktid?: string; // tv, movie
    doubanid?: string; // tv, movie
    year?: string; // tv, movie
    genre?: string; // tv, movie
  };
  tv: {
    q: string;
    season?: string; // tv
    ep?: string; // tv
    imdbid?: string; // tv, movie
    tvdbid?: string; // tv
    rid?: string; // tv
    tmdbid?: string; // tv, movie
    tvmazeid?: string; // tv
    traktid?: string; // tv, movie
    doubanid?: string; // tv, movie
    year?: string; // tv, movie
    genre?: string; // tv, movie
  };
  movie: {
    q: string;
    imdbid?: string; // tv, movie
    tmdbid?: string; // tv, movie
    traktid?: string; // tv, movie
    doubanid?: string; // tv, movie
    year?: string; // tv, movie
    genre?: string; // tv, movie
  };
}
