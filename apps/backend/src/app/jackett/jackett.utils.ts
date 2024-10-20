import { ElementCompact } from 'xml-js';
import {
  CategoryType,
  JackettIndexer,
  JackettSimplifiedTracker,
  JackettTracker,
  SearchType,
  VideoQuality,
} from './jackett.types';
import { monoIndexers } from './jackett.const';

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

export function getVideoQuality(title: string): VideoQuality {
  if (title.match(/2160p|4k/i)) {
    return 2160;
  }
  if (title.match(/1440p|2k/i)) {
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
