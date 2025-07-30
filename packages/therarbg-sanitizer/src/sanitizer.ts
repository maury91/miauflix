import type {
  TheRARBGImdbData,
  TheRARBGPost,
  SanitizationOptions,
  GetPostsResponse,
  GetPosts,
  SourceFile,
} from './types';
import { DEFAULT_OPTIONS } from './constants';
import {
  generateFakeTitle,
  generateFakeImdbId,
  generateFakePersonName,
  generateSafeInfoHash,
  sanitizeName,
  generateFakePlot,
  generateFakeUrl,
} from './utils';
import { extractSourceMetadata } from '@miauflix/source-metadata-extractor';

/**
 * Sanitize IMDB data
 */
export function sanitizeImdbData(
  imdbData: TheRARBGImdbData,
  options: SanitizationOptions = {}
): TheRARBGImdbData {
  if (!imdbData || typeof imdbData !== 'object') {
    return imdbData;
  }

  const sanitized = { ...imdbData };

  // Use IMDB ID as the seed for deterministic generation
  const seedId = sanitized.imdb_id || 'unknown';
  const contentType = sanitized.content_type === 'Movie' ? 'Movie' : 'TV';

  // Generate fake title and IMDB ID deterministically
  const fakeTitle = generateFakeTitle(seedId, contentType);
  const fakeImdbId = options.preserveImdbId
    ? sanitized.imdb_id
    : generateFakeImdbId(seedId, contentType);

  // Replace title and IMDB ID
  sanitized.name = fakeTitle;
  sanitized.imdb_id = fakeImdbId;

  // Sanitize plot/description
  if (sanitized.plot) {
    sanitized.plot = generateFakePlot(seedId, {
      realTitle: imdbData.name,
      fakeTitle,
      realImdbId: seedId,
      fakeImdbId,
      contentType,
    });
  }

  // Sanitize person names using their names as seeds
  if (sanitized.actors && Array.isArray(sanitized.actors)) {
    sanitized.actors = sanitized.actors.map(actor => generateFakePersonName(actor));
  }

  if (sanitized.directors && Array.isArray(sanitized.directors)) {
    sanitized.directors = sanitized.directors.map(director => generateFakePersonName(director));
  }

  if (sanitized.director) {
    sanitized.director = generateFakePersonName(sanitized.director);
  }

  if (sanitized.cast) {
    // Split cast string, sanitize each name, rejoin
    const castNames = sanitized.cast.split(',').map(name => name.trim());
    sanitized.cast = castNames.map(name => generateFakePersonName(name)).join(', ');
  }

  // Sanitize top credits
  if (sanitized.top_credits && Array.isArray(sanitized.top_credits)) {
    sanitized.top_credits = sanitized.top_credits.map(credit => ({
      ...credit,
      credits: credit.credits.map(name => generateFakePersonName(name)),
    }));
  }

  // Sanitize URLs and images using IMDB ID as seed
  if (sanitized.thumbnail) {
    sanitized.thumbnail = generateFakeUrl(sanitized.thumbnail, `thumb_${fakeImdbId}`);
  }

  if (sanitized.image) {
    sanitized.image = generateFakeUrl(sanitized.image, `image_${fakeImdbId}`);
  }

  if (sanitized.rott_url) {
    sanitized.rott_url = generateFakeUrl(sanitized.rott_url, `rott_${fakeImdbId}`);
  }

  // Sanitize video list (YouTube keys, etc.)
  if (sanitized.video_list && Array.isArray(sanitized.video_list)) {
    sanitized.video_list = sanitized.video_list.map((video, index) => ({
      ...video,
      key: `fake_video_${fakeImdbId}_${index}`,
    }));
  }

  return sanitized;
}

/**
 * Sanitize a single post
 */
export function sanitizePost(
  post: TheRARBGPost,
  imdbData: TheRARBGImdbData,
  options: SanitizationOptions = {}
): TheRARBGPost {
  if (!post || typeof post !== 'object') {
    return post;
  }

  const { preserveTechnicalMetadata = DEFAULT_OPTIONS.preserveTechnicalMetadata } = options;

  const sanitized = { ...post };

  // Get the fake title and IMDB ID from the IMDB data
  const contentType: 'Movie' | 'TV' = imdbData.content_type === 'Movie' ? 'Movie' : 'TV';
  const fakeTitle = generateFakeTitle(imdbData.name || post.imdb, contentType);
  const fakeImdbId = options.preserveImdbId
    ? post.imdb || imdbData.imdb_id
    : generateFakeImdbId(post.imdb || imdbData.imdb_id, contentType);

  // Create a title mapping for name sanitization
  const titleMapping = {
    realTitle: imdbData.name,
    fakeTitle,
    realImdbId: post.imdb,
    fakeImdbId,
    contentType,
  };

  // Sanitize name using source metadata extraction
  if (sanitized.name) {
    sanitized.name = sanitizeName(sanitized.name, titleMapping, preserveTechnicalMetadata);
  }

  // Sanitize short name if present
  if (sanitized.short_name) {
    sanitized.short_name = sanitizeName(
      sanitized.short_name,
      titleMapping,
      preserveTechnicalMetadata
    );
  }

  // Replace IMDB ID
  sanitized.imdb = fakeImdbId;

  // Generate safe info hash using original hash as seed, with potential legal hash
  if (sanitized.info_hash) {
    sanitized.info_hash = generateSafeInfoHash(
      sanitized.info_hash,
      post.imdb,
      options.useLegalHashes || false,
      options,
      contentType
    );
  }

  // Sanitize uploader username using username as seed
  if (sanitized.username) {
    sanitized.username = generateFakePersonName(sanitized.username);
  }

  // Sanitize thumbnail URL
  if (sanitized.thumbnail) {
    sanitized.thumbnail = generateFakeUrl(sanitized.thumbnail, `torrent_${sanitized.pid}`);
  }

  // Sanitize description if present
  if (sanitized.descr) {
    sanitized.descr = generateFakePlot(sanitized.descr, titleMapping);
  }

  // Sanitize file paths
  if (sanitized.files && Array.isArray(sanitized.files)) {
    sanitized.files = sanitized.files.map((file, index) => {
      if (Array.isArray(file.name)) {
        if (file.name.length === 0) {
          return file;
        }
        // Extract original extension
        const originalExtension = file.name[0].split('.').pop() || 'mkv';

        return {
          size: Array.isArray(file.size) ? file.size : [file.size],
          name: [`fake_file_${index}.${originalExtension}`],
        } satisfies SourceFile;
      }

      // Extract original extension
      const originalExtension = file.name.split('.').pop() || 'mkv';

      return {
        name: `fake_file_${index}.${originalExtension}`,
        size: Array.isArray(file.size) ? file.size[0] : file.size,
        full_location: `fake_path_${index}/fake_file_${index}.${originalExtension}`,
      } satisfies SourceFile;
    });
  }

  // Sanitize images
  if (sanitized.images && Array.isArray(sanitized.images)) {
    sanitized.images = sanitized.images.map((image, index) =>
      generateFakeUrl(image, `torrent_image_${sanitized.pid}_${index}`)
    );
  }

  return sanitized;
}

/**
 * Determine content type from get-posts category
 */
function getContentTypeFromCategory(category: string | number): 'Movie' | 'TV' | 'Other' {
  const categoryStr = typeof category === 'string' ? category : String(category);
  const lowerCategory = categoryStr.toLowerCase();

  if (lowerCategory === 'movies' || lowerCategory === 'movie') return 'Movie';
  if (lowerCategory === 'tv' || lowerCategory === 'television') return 'TV';
  if (lowerCategory === 'anime') return 'Movie'; // Treat Anime as Movie content for sanitization
  return 'Other'; // Apps, Games, Music, etc.
}

/**
 * Sanitize a single get-posts item
 */
function sanitizeGetPostsItem(item: GetPosts, options: SanitizationOptions = {}): GetPosts {
  if (!item || typeof item !== 'object') {
    return item;
  }

  const sanitized = { ...item };
  const contentType = getContentTypeFromCategory(item.c);

  if (contentType === 'Movie' || contentType === 'TV') {
    // Handle Movies/TV with IMDB-based logic
    const seedId = item.i || String(item.pk) || item.n || 'unknown';
    const fakeTitle = generateFakeTitle(seedId, contentType);
    const fakeImdbId =
      options.preserveImdbId && item.i ? item.i : generateFakeImdbId(seedId, contentType);

    // For get-posts, we need to extract the real title from the name first
    // Try to extract using source metadata extractor
    let realTitle = item.n;
    try {
      const metadata = extractSourceMetadata({
        name: item.n,
        size: item.s || 1000000000,
      });
      if (metadata.title) {
        realTitle = metadata.title;
      }
    } catch (error) {
      // If extraction fails, use the full name as fallback
      realTitle = item.n;
    }

    // Create title mapping for name sanitization
    const titleMapping = {
      realTitle,
      fakeTitle,
      realImdbId: item.i || 'unknown',
      fakeImdbId,
      contentType,
    };

    // Sanitize name
    sanitized.n = sanitizeName(item.n, titleMapping, options.preserveTechnicalMetadata !== false);

    // Replace IMDB ID if present, or if we have a fake one to set
    if (sanitized.i || !options.preserveImdbId) {
      sanitized.i = fakeImdbId;
    }

    // Generate legal or fake hash
    sanitized.h = generateSafeInfoHash(
      item.h,
      seedId,
      options.useLegalHashes || false,
      options,
      contentType
    );
  } else {
    // Handle Apps/Games/Other with generic fake data
    const seedId = String(item.pk) + '_' + item.n;

    // Generate fake app/game name using the original name as seed
    sanitized.n = generateFakeAppName(item.n, seedId);

    // Generate fake hash for non-movie content
    sanitized.h = generateSafeInfoHash(item.h, seedId, false, options);

    // Clear IMDB ID for non-movie content
    sanitized.i = null;
  }

  // Sanitize uploader username
  if (sanitized.u) {
    sanitized.u = generateFakePersonName(sanitized.u);
  }

  // Sanitize thumbnail URL if present
  if (sanitized.t) {
    sanitized.t = generateFakeUrl(sanitized.t, `thumb_${sanitized.pk}`);
  }

  return sanitized;
}

/**
 * Generate fake app/game names for non-movie content
 */
function generateFakeAppName(originalName: string, seed: string): string {
  // Use existing faker integration with seeding
  const { faker } = require('@faker-js/faker');

  // Create a deterministic seed from the input
  const seedValue = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  faker.seed(seedValue);

  const appTypes = [
    'Pro',
    'Suite',
    'Studio',
    'Manager',
    'Player',
    'Editor',
    'Converter',
    'Optimizer',
    'Cleaner',
    'Booster',
    'Security',
    'Antivirus',
    'Toolkit',
  ];

  const appNames = [
    'Productivity',
    'Media',
    'System',
    'Photo',
    'Video',
    'Audio',
    'Document',
    'File',
    'Network',
    'Security',
    'Game',
    'Development',
    'Design',
    'Office',
  ];

  const baseName = faker.helpers.arrayElement(appNames);
  const type = faker.helpers.arrayElement(appTypes);
  const version = `${faker.number.int({ min: 1, max: 20 })}.${faker.number.int({ min: 0, max: 9 })}`;

  return `${baseName} ${type} ${version}`;
}

/**
 * Sanitize get-posts response
 */
function sanitizeGetPostsResponse(
  response: GetPostsResponse,
  options: SanitizationOptions = {}
): GetPostsResponse {
  if (!response || typeof response !== 'object') {
    return response;
  }

  const { maxItems = DEFAULT_OPTIONS.maxItems } = options;
  const sanitized = { ...response };

  // Sanitize results array
  let sanitizedResults = response.results || [];

  // Limit number of items if specified
  if (maxItems > 0 && sanitizedResults.length > maxItems) {
    sanitizedResults = sanitizedResults.slice(0, maxItems);
    // Update counts to reflect the limitation
    sanitized.count = Math.min(sanitized.count, maxItems);
    sanitized.total = Math.min(sanitized.total, maxItems);
  }

  // Sanitize each result item
  sanitized.results = sanitizedResults.map(item => sanitizeGetPostsItem(item, options));

  return sanitized;
}

/**
 * Main sanitization function for TheRARBG API responses
 */
export function sanitize(data: any, url?: string, options: SanitizationOptions = {}): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const { maxItems = DEFAULT_OPTIONS.maxItems } = options;

  // Handle wrapped HTTP-VCR responses
  if ('body' in data && data.body && typeof data.body === 'object') {
    const sanitized = { ...data };
    sanitized.body = sanitize(data.body, url, options);
    return sanitized;
  }

  // Handle IMDB detail responses
  if ('imdb' in data && 'trb_posts' in data) {
    const response = data as any;

    // Sanitize IMDB data first
    const sanitizedImdb = sanitizeImdbData(response.imdb, options);

    // Sanitize posts using the original IMDB data for context
    let sanitizedPosts = response.trb_posts || [];

    // Limit number of posts if specified
    if (maxItems > 0 && sanitizedPosts.length > maxItems) {
      sanitizedPosts = sanitizedPosts.slice(0, maxItems);
    }

    sanitizedPosts = sanitizedPosts.map((post: TheRARBGPost) =>
      sanitizePost(post, response.imdb, options)
    );

    return {
      ...data,
      imdb: sanitizedImdb,
      trb_posts: sanitizedPosts,
    };
  }

  // Handle get-posts responses
  if ('results' in data && Array.isArray(data.results) && 'page_size' in data) {
    return sanitizeGetPostsResponse(data, options);
  }

  // Handle other response types - for future implementation
  console.warn('Unknown TheRARBG response format, returning as-is:', data);
  return data;
}

/**
 * Sanitize a single IMDB detail response (convenience function)
 */
export function sanitizeImdbDetail(
  response: { imdb: TheRARBGImdbData; trb_posts: TheRARBGPost[] },
  options: SanitizationOptions = {}
): { imdb: TheRARBGImdbData; trb_posts: TheRARBGPost[] } {
  return sanitize(response, undefined, options) as {
    imdb: TheRARBGImdbData;
    trb_posts: TheRARBGPost[];
  };
}
