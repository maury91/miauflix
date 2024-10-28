import { ElementCompact } from 'xml-js';
import {
  CategoryType,
  JackettIndexer,
  JackettSimplifiedTracker,
  JackettTracker,
  SearchType,
  VideoSource,
} from './jackett.types';
import { monoIndexers } from './jackett.const';
import { VideoCodec, VideoQuality } from '@miauflix/types';

export const simplifyXMLObject = (obj: ElementCompact) => {
  const keys = Object.keys(obj);
  if (keys.length === 1 && keys[0] === '_text') {
    return obj['_text'];
  }
  return keys.reduce((res, key) => {
    if (key === '_attributes') {
      if (
        Object.keys(obj['_attributes']).every(
          (attrKey) => !keys.includes(attrKey)
        )
      ) {
        return {
          ...res,
          ...obj['_attributes'],
        };
      }
    } else if (Array.isArray(obj[key])) {
      res[key] = obj[key].map(simplifyXMLObject);
    } else if (typeof obj[key] === 'object') {
      if (Object.keys(obj[key]).length === 0) {
        res[key] = null;
      } else {
        res[key] = simplifyXMLObject(obj[key]);
      }
    } else {
      res[key] = obj[key];
    }
    return res;
  }, {});
};

export function categorize(category: string): string | null {
  const lowerCase = category.toLowerCase();
  // Banned
  if (
    ['x265', '3d', 'bollywood', 'music', 'Non-english'].some((keyword) =>
      lowerCase.includes(keyword)
    )
  ) {
    return null;
  }
  if (lowerCase.includes('anime')) {
    return 'anime';
  }
  if (lowerCase.includes('movies')) {
    return 'movie';
  }
  if (lowerCase.includes('tv')) {
    return 'tv';
  }
  return null;
}

export const simplifyTracker =
  (targetCategory: CategoryType) =>
  (tracker: JackettTracker): JackettSimplifiedTracker => ({
    id: tracker.id,
    title: tracker.title,
    maxLimit: tracker.maxLimit,
    defaultLimit: tracker.defaultLimit,
    categories: tracker.categories[targetCategory].map(({ id }) => id),
    ...tracker.searching,
  });

export function getCategoriesByType(indexer: JackettIndexer) {
  const categoriesByType: Record<CategoryType, { id: number; name: string }[]> =
    {
      anime: [],
      movie: [],
      tv: [],
    };

  const allCategories = indexer.caps.categories.category
    .map((category) => {
      if ('subcat' in category) {
        return [category, category.subcat];
      }
      return category;
    })
    .flat(2);

  allCategories.forEach((category) => {
    const type = categorize(category.name);
    if (type) {
      categoriesByType[type].push({
        id: parseInt(category.id, 10),
        name: category.name,
      });
    }
  });

  // Remove categories for some indexers
  if (monoIndexers.anime.includes(indexer.id)) {
    categoriesByType.movie = [];
    categoriesByType.tv = [];
  }
  if (monoIndexers.movies.includes(indexer.id)) {
    categoriesByType.anime = [];
    categoriesByType.tv = [];
  }
  if (monoIndexers.tv.includes(indexer.id)) {
    categoriesByType.anime = [];
    categoriesByType.movie = [];
  }

  return categoriesByType;
}

export function getInnerSearchType(
  searchType: CategoryType,
  tracker: JackettTracker
): SearchType {
  switch (searchType) {
    case 'tv':
      if (tracker.searching.tvSearch.available) {
        return 'tvSearch';
      }
      break;
    case 'anime':
      if (tracker.searching.tvSearch.available) {
        return 'tvSearch';
      }
      break;
    case 'movie':
      if (tracker.searching.movie.available) {
        return 'movie';
      }
      break;
  }
  return 'search';
}

function tokenize(title: string): string[] {
  return title
    .replace(/[\W_]+/g, ' ')
    .split(' ')
    .filter((word) => word.length >= 2);
}

type Not10Bit<T> = T extends `${string} 10bit` ? never : T;

export function getVideoCodec(title: string): VideoCodec {
  const checkFor10Bit = (
    foundCodec: Exclude<Not10Bit<VideoCodec>, 'XVid' | 'unknown'>
  ): VideoCodec => {
    const is10Bit = title.match(/10.?bit/i) !== null;
    if (is10Bit) {
      return `${foundCodec} 10bit`;
    }
    return foundCodec;
  };
  if (title.match(/[HX][ .]?264/i) || title.match(/mpeg-4/i)) {
    return checkFor10Bit('x264');
  }
  if (title.match(/[HX][ .]?265/i)) {
    return checkFor10Bit('x265');
  }
  const tokens = tokenize(title.toLowerCase());
  if (tokens.includes('hevc')) {
    return checkFor10Bit('x265');
  }
  if (tokens.includes('avc')) {
    return checkFor10Bit('x264');
  }
  // Deadpool.and.Wolverine.2024.1080p.WEBRip.AAC5.1.10bits.AV1-Rapta
  if (tokens.includes('av1')) {
    return checkFor10Bit('AV1');
  }
  if (tokens.includes('xvid')) {
    return 'XVid';
  }
  return 'unknown';
}

function arraysIntersect(arr1: string[], arr2: string[]) {
  return arr2.some((item) => arr1.includes(item));
}

const BluRayTermsCaseInsensitive = [
  'bdrip',
  'bluray',
  'bdremux',
  'bdmux',
  'brrip',
  'bdscr',
  'bdr',
];

const BlurayTermsCaseSensitive = ['BR'];
const HDTVTermsCaseInsensitive = ['hdtv', 'hdrip'];
const DVDTermsCaseInsensitive = ['dvdrip', 'dvdr', 'dvdscr', 'dvd'];
const TeleSyncTermsCaseInsensitive = ['tsrip', 'telesync', 'hdts'];
const TeleSyncTermsCaseSensitive = ['TS'];
const WebTermsCaseInsensitive = [
  'webrip',
  'webdl',
  'itunes',
  'netflix',
  'appletv',
];
const WebTermsCaseSensitive = ['WEB', 'AMZN'];
const CamCaseInsensitive = ['cam', 'hdcam'];
const FallbackTermsCaseInsensitive = ['hdr', '6ch', 'hdr10', 'dd71', 'dd51'];

export function getVideoSource(title: string): VideoSource {
  const tokens = tokenize(title);
  const tokensLC = tokenize(title.toLowerCase());
  if (
    arraysIntersect(tokensLC, BluRayTermsCaseInsensitive) ||
    arraysIntersect(tokens, BlurayTermsCaseSensitive) ||
    title.match(/\bblu.?ray\b/i) ||
    title.match(/\bbr.?rip\b/i)
  ) {
    return 'Blu-ray';
  }
  if (arraysIntersect(tokensLC, HDTVTermsCaseInsensitive)) {
    return 'HDTV';
  }
  if (arraysIntersect(tokensLC, DVDTermsCaseInsensitive)) {
    return 'DVD';
  }
  if (
    arraysIntersect(tokensLC, TeleSyncTermsCaseInsensitive) ||
    arraysIntersect(tokens, TeleSyncTermsCaseSensitive) ||
    title.match(/\bhd.?ts\b/i)
  ) {
    return 'TS';
  }
  if (
    arraysIntersect(tokensLC, WebTermsCaseInsensitive) ||
    arraysIntersect(tokens, WebTermsCaseSensitive)
  ) {
    return 'WEB';
  }
  if (arraysIntersect(tokensLC, CamCaseInsensitive)) {
    return 'Cam';
  }
  // Last fallback, terms that suggest it's a Blu-ray ( without being sure of it )
  if (
    arraysIntersect(tokensLC, FallbackTermsCaseInsensitive) ||
    title.match(/\b[57].1\b/i)
  ) {
    return 'Blu-ray';
  }
  return 'unknown';
}

export function getVideoQuality(title: string): VideoQuality {
  if (title.match(/2160p|(\b4k\b)/i)) {
    return 2160;
  }
  if (title.match(/1440p|(\b2k\b)/i)) {
    return 1440;
  }
  if (title.match(/1080p/i)) {
    return 1080;
  }
  if (title.match(/720p/i)) {
    return 720;
  }
  if (title.match(/480p/i)) {
    return 480;
  }
  if (title.match(/360p/i)) {
    return 360;
  }
  // Most probable one
  return 720;
}

// export function getTorrentScore(
//   seeders: number,
//   peers: number,
//   quality: VideoQuality
// ): number {
//   const availabilityIndex = (seeders * 5 + peers) / 3000;
//   const qualityIndex =
//     allVideoQualities.indexOf(quality) / allVideoQualities.length;
//   return Math.max((availabilityIndex + qualityIndex) * 50, 100);
// }
