/**
 * tmdb.sanitize.ts
 * TMDB Mock Data Sanitizer - Runtime sanitization for any TMDB endpoint
 */

import seedrandom from 'seedrandom';
import { fakerEN as faker } from '@faker-js/faker';
import {
  uniqueNamesGenerator,
  adjectives as ungAdjectives,
  animals as ungAnimals,
  colors as ungColors,
  countries as ungCountries,
  names as ungNames,
  starWars as ungStarWars,
} from 'unique-names-generator';

// Cache for consistent data across calls
const cache = new Map<string, any>();

/**
 * Initialize faker with deterministic seed based on input
 */
function initFaker(id: number): void {
  faker.seed(id);
}

/**
 * Generate consistent fake data with caching
 */
function getCached<T>(key: string, generator: () => T): T {
  if (cache.has(key)) {
    return cache.get(key);
  }
  const value = generator();
  cache.set(key, value);
  return value;
}

/**
 * Generate fake movie/TV show title
 */
function generateTitle(id: string): string {
  const seed = seedrandom(id);
  return getCached(`title:${id}`, () => {
    initFaker(seed.int32());
    return uniqueNamesGenerator({
      dictionaries: [ungAdjectives, ungAnimals],
      separator: ' ',
      style: 'capital',
    });
  });
}

/**
 * Generate fake person name
 */
function generatePersonName(id: number): string {
  return getCached(`person:${id}`, () => {
    initFaker(id);
    return faker.person.fullName();
  });
}

/**
 * Generate fake overview/biography
 */
function generateOverview(id: string, originalOverview: string): string {
  if (!originalOverview) return '';
  const seed = seedrandom(id);
  return getCached(`overview:${id}`, () => {
    initFaker(seed.int32());
    // Generate 1-3 sentences
    const sentences = faker.helpers.rangeToNumber({ min: 1, max: 3 });
    return Array.from({ length: sentences }, () => faker.lorem.sentence()).join(' ');
  });
}

/**
 * Generate fake tagline
 */
function generateTagline(id: string, originalTagline: string): string {
  if (!originalTagline) return '';
  const seed = seedrandom(id);
  return getCached(`tagline:${id}`, () => {
    initFaker(seed.int32());
    return faker.lorem.sentence({ min: 3, max: 8 });
  });
}

/**
 * Generate fake homepage URL
 */
function generateHomepage(id: string, original: string): string {
  if (!original) return '';

  const seed = seedrandom(id);
  return getCached(`homepage:${id}`, () => {
    initFaker(seed.int32());
    const domain = faker.internet.domainName();
    return `https://${domain}`;
  });
}

/**
 * Generate fake production company name
 */
function generateCompanyName(id: number): string {
  return getCached(`company:${id}`, () => {
    initFaker(id);
    return (
      uniqueNamesGenerator({
        dictionaries: [ungAdjectives, ungStarWars],
        separator: ' ',
        style: 'capital',
      }) +
      ' ' +
      faker.helpers.arrayElement(['Studios', 'Pictures', 'Entertainment', 'Productions', 'Media'])
    );
  });
}

/**
 * Generate fake country/language codes
 */
function generateCountryCode(id: number): string {
  return getCached(`country:${id}`, () => {
    initFaker(id);
    return faker.location.countryCode();
  });
}

function generateLanguageCode(id: number): string {
  return getCached(`lang:${id}`, () => {
    initFaker(id);
    return faker.helpers.arrayElement(['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh']);
  });
}

/**
 * Sanitize a single movie/TV item (used in lists and detail responses)
 */
function sanitizeMediaItem(item: any): any {
  if (!item || typeof item !== 'object') return item;

  const sanitized = { ...item };
  const id = `${sanitized.id}`;

  // Common fields for movies and TV shows
  if (sanitized.title) {
    sanitized.title = generateTitle(`title_${id}`);
  }
  if (sanitized.original_title) {
    sanitized.original_title = generateTitle(`original_title_${id}`);
  }
  if (sanitized.name) {
    sanitized.name = generateTitle(`name_${id}`);
  }
  if (sanitized.original_name) {
    sanitized.original_name = generateTitle(`original_name_${id}`);
  }
  if (sanitized.overview) {
    sanitized.overview = generateOverview(id, sanitized.overview);
  }
  if (sanitized.tagline) {
    sanitized.tagline = generateTagline(id, sanitized.tagline);
  }
  if (sanitized.homepage) {
    sanitized.homepage = generateHomepage(id, sanitized.homepage);
  }

  // Production companies
  if (sanitized.production_companies && Array.isArray(sanitized.production_companies)) {
    sanitized.production_companies = sanitized.production_companies.map((company: any) => ({
      ...company,
      name: company.name ? generateCompanyName(company.id) : company.name,
    }));
  }

  // Networks (for TV shows)
  if (sanitized.networks && Array.isArray(sanitized.networks)) {
    sanitized.networks = sanitized.networks.map((network: any) => ({
      ...network,
      name: network.name ? generateCompanyName(network.id) : network.name,
    }));
  }

  // Cast and crew
  if (sanitized.cast && Array.isArray(sanitized.cast)) {
    sanitized.cast = sanitized.cast.map((person: any) => ({
      ...person,
      name: person.name ? generatePersonName(person.id) : person.name,
      original_name: person.original_name ? generatePersonName(person.id) : person.original_name,
    }));
  }
  if (sanitized.crew && Array.isArray(sanitized.crew)) {
    sanitized.crew = sanitized.crew.map((person: any) => ({
      ...person,
      name: person.name ? generatePersonName(person.id) : person.name,
      original_name: person.original_name ? generatePersonName(person.id) : person.original_name,
    }));
  }
  if (sanitized.guest_stars && Array.isArray(sanitized.guest_stars)) {
    sanitized.guest_stars = sanitized.guest_stars.map((person: any) => ({
      ...person,
      name: person.name ? generatePersonName(person.id) : person.name,
      original_name: person.original_name ? generatePersonName(person.id) : person.original_name,
    }));
  }

  // Created by (TV shows)
  if (sanitized.created_by && Array.isArray(sanitized.created_by)) {
    sanitized.created_by = sanitized.created_by.map((person: any) => ({
      ...person,
      name: person.name ? generatePersonName(person.id) : person.name,
      original_name: person.original_name ? generatePersonName(person.id) : person.original_name,
    }));
  }

  if (sanitized.belongs_to_collection) {
    sanitized.belongs_to_collection = {
      ...sanitized.belongs_to_collection,
      name: sanitized.belongs_to_collection.name
        ? generateTitle(`${sanitized.belongs_to_collection.id}`)
        : sanitized.belongs_to_collection.name,
    };
  }

  return sanitized;
}

/**
 * Main sanitization function that handles different TMDB response types
 */
export function sanitize(data: any, url?: string): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Handle paginated results (discover, search, lists, changes)
  if (data.results && Array.isArray(data.results)) {
    const sanitized = {
      ...data,
      results: data.results.map(sanitizeMediaItem),
    };

    // Limit pagination data to prevent backend from fetching too many pages
    if (typeof data.total_pages === 'number') {
      const maxPages = 3;
      const resultsPerPage = data.results.length || 20; // Usually 20 results per page

      sanitized.total_pages = Math.min(maxPages, data.total_pages);

      // Adjust total_results to match limited pages
      if (typeof data.total_results === 'number') {
        sanitized.total_results = Math.min(maxPages * resultsPerPage, data.total_results);
      }
    }

    return sanitized;
  }

  // Handle TV show episode lists
  if (data.episodes && Array.isArray(data.episodes)) {
    return {
      ...data,
      episodes: data.episodes.map(sanitizeMediaItem),
    };
  }

  // Handle configuration endpoint (mostly unchanged except for some URLs)
  if (url?.includes('/configuration')) {
    return data; // Configuration data is mostly technical, keep as-is
  }

  // Handle changes endpoint
  if (url?.includes('/changes')) {
    return data; // Changes are just IDs, keep as-is
  }

  // Handle single movie/TV show details (with possible appended responses)
  if (data.id && (data.title || data.name)) {
    const sanitized = sanitizeMediaItem(data);

    // Limit TV show seasons and episodes
    if (sanitized.number_of_seasons) {
      const maxSeasons = 5;

      // Calculate average episodes per season from the original data for variance
      let avgEpisodesPerSeason = 12; // Fallback default
      if (sanitized.number_of_episodes && sanitized.number_of_seasons > 0) {
        avgEpisodesPerSeason = Math.round(
          sanitized.number_of_episodes / sanitized.number_of_seasons
        );
        // Ensure reasonable bounds (between 6 and 24 episodes per season)
        avgEpisodesPerSeason = Math.max(6, Math.min(24, avgEpisodesPerSeason));
      }

      sanitized.number_of_seasons = Math.min(sanitized.number_of_seasons, maxSeasons);

      // Limit number of episodes proportionally using calculated average
      if (sanitized.number_of_episodes) {
        sanitized.number_of_episodes = Math.min(
          sanitized.number_of_episodes,
          maxSeasons * avgEpisodesPerSeason
        );
      }

      // Limit seasons array if present
      if (sanitized.seasons && Array.isArray(sanitized.seasons)) {
        // Keep specials (season 0) plus first maxSeasons regular seasons
        const specials = sanitized.seasons.filter((season: any) => season.season_number === 0);
        const regularSeasons = sanitized.seasons
          .filter((season: any) => season.season_number > 0)
          .slice(0, maxSeasons);

        sanitized.seasons = [...specials, ...regularSeasons];

        // Calculate exact number of episodes by summing episode_count from remaining seasons
        const totalEpisodes = sanitized.seasons.reduce((sum: number, season: any) => {
          return sum + (season.episode_count || 0);
        }, 0);

        // Update number_of_episodes to match the actual remaining episodes
        // If totalEpisodes is 0, fallback to calculated average
        if (totalEpisodes > 0) {
          sanitized.number_of_episodes = totalEpisodes;
        } else {
          // Fallback: use calculated average episodes per season
          sanitized.number_of_episodes = maxSeasons * avgEpisodesPerSeason;
        }

        // Get info about the last actual season for episode references
        const lastRegularSeason =
          regularSeasons.length > 0 ? regularSeasons[regularSeasons.length - 1] : null;
        const lastSeasonNumber = lastRegularSeason?.season_number || maxSeasons;
        const lastSeasonEpisodeCount = lastRegularSeason?.episode_count || avgEpisodesPerSeason;

        // Limit last_episode_to_air to fit within our actual limited seasons
        if (sanitized.last_episode_to_air && sanitized.last_episode_to_air.season_number) {
          if (sanitized.last_episode_to_air.season_number > lastSeasonNumber) {
            sanitized.last_episode_to_air = {
              ...sanitized.last_episode_to_air,
              name: sanitized.last_episode_to_air.name
                ? generateTitle(`${sanitized.last_episode_to_air.id}`)
                : sanitized.last_episode_to_air.name,
              overview: sanitized.last_episode_to_air.overview
                ? generateOverview(
                    `${sanitized.last_episode_to_air.id}`,
                    sanitized.last_episode_to_air.overview
                  )
                : sanitized.last_episode_to_air.overview,
              season_number: lastSeasonNumber,
              episode_number: Math.min(
                sanitized.last_episode_to_air.episode_number || 1,
                lastSeasonEpisodeCount
              ),
            };
          }
        }

        // Limit next_episode_to_air similarly
        if (sanitized.next_episode_to_air && sanitized.next_episode_to_air.season_number) {
          if (sanitized.next_episode_to_air.season_number > lastSeasonNumber) {
            sanitized.next_episode_to_air = null; // Remove it since it's beyond our limited seasons
          }
        }
      } else {
        // Fallback when no seasons array: use the calculated average
        if (sanitized.number_of_episodes) {
          sanitized.number_of_episodes = Math.min(
            sanitized.number_of_episodes,
            maxSeasons * avgEpisodesPerSeason
          );
        }

        // Limit last_episode_to_air season_number to not exceed our max seasons
        if (sanitized.last_episode_to_air && sanitized.last_episode_to_air.season_number) {
          if (sanitized.last_episode_to_air.season_number > maxSeasons) {
            sanitized.last_episode_to_air = {
              ...sanitized.last_episode_to_air,
              season_number: maxSeasons,
              episode_number: Math.min(
                sanitized.last_episode_to_air.episode_number || 1,
                avgEpisodesPerSeason
              ),
            };
          }
        }

        // Limit next_episode_to_air season_number to not exceed our max seasons
        if (sanitized.next_episode_to_air && sanitized.next_episode_to_air.season_number) {
          if (sanitized.next_episode_to_air.season_number > maxSeasons) {
            sanitized.next_episode_to_air = null;
          }
        }
      }
    }

    // Handle appended responses
    if (data.translations && data.translations.translations) {
      sanitized.translations = {
        ...data.translations,
        translations: data.translations.translations
          .filter((translation: any) => ['en', 'it', 'lt', 'es'].includes(translation.iso_639_1))
          .map((translation: any) => ({
            ...translation,
            data: {
              ...translation.data,
              title: translation.data?.title
                ? generateTitle(`${translation.iso_639_1}_title_${sanitized.id}`)
                : translation.data?.title,
              name: translation.data?.name
                ? generateTitle(`${translation.iso_639_1}_name_${sanitized.id}`)
                : translation.data?.name,
              overview: translation.data?.overview
                ? generateOverview(
                    `${translation.iso_639_1}_${sanitized.id}`,
                    translation.data.overview
                  )
                : translation.data?.overview,
              tagline: translation.data?.tagline
                ? generateTagline(
                    `${translation.iso_639_1}_${sanitized.id}`,
                    translation.data.tagline
                  )
                : translation.data?.tagline,
              homepage: translation.data?.homepage
                ? generateHomepage(
                    `${translation.iso_639_1}_${sanitized.id}`,
                    translation.data.homepage
                  )
                : translation.data?.homepage,
            },
          })),
      };
    }

    // Handle images (keep structure but don't need to sanitize file paths)
    if (data.images) {
      sanitized.images = Object.fromEntries(
        Object.entries(data.images).map(([key, value]) => {
          if (Array.isArray(value)) {
            return [key, value.slice(0, 5)];
          }
          return [key, value];
        })
      );
    }

    // Handle external IDs (keep as-is since they're just ID mappings)
    if (data.external_ids) {
      sanitized.external_ids = data.external_ids;
    }

    return sanitized;
  }

  // Default: return data as-is if we don't recognize the format
  return data;
}

export default sanitize;
