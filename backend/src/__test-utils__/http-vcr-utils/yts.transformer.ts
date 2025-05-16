/**
 * Deterministically transforms YTS responses.
 * This ensures that:
 * 1. Movie titles are replaced with appropriate alternatives
 * 2. URLs pointing to torrent downloads are scrambled
 * 3. Torrent hashes are modified
 * 4. Other sensitive data is altered
 */
export function transformYtsData(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const transformedData = { ...data } as Record<string, unknown>;

  // If this is the response body with YTS-specific structure
  if (
    transformedData.body &&
    typeof transformedData.body === 'object' &&
    transformedData.body !== null
  ) {
    const body = transformedData.body as Record<string, unknown>;

    // Process movie listings
    if (body.data && typeof body.data === 'object' && body.data !== null) {
      const dataObj = body.data as Record<string, unknown>;

      // Transform movie list
      if (Array.isArray(dataObj.movies)) {
        dataObj.movies = transformMovieList(dataObj.movies);
      }

      // Transform single movie details
      if (dataObj.movie && typeof dataObj.movie === 'object') {
        dataObj.movie = transformMovie(dataObj.movie as Record<string, unknown>);
      }
    }

    transformedData.body = body;
  }

  return transformedData;
}

/**
 * Transforms an array of movie objects
 */
function transformMovieList(movies: unknown[]): unknown[] {
  return movies.map(movie => {
    if (typeof movie === 'object' && movie !== null) {
      return transformMovie(movie as Record<string, unknown>);
    }
    return movie;
  });
}

/**
 * Transforms a single movie object
 */
function transformMovie(movie: Record<string, unknown>): Record<string, unknown> {
  const transformed = { ...movie };

  // Transform movie title and related fields
  if (typeof transformed.title === 'string') {
    const title = transformMovieTitle(transformed.title as string);
    transformed.title = title;
    transformed.slug = title.replace(/\s+/g, '-').toLowerCase();
  }

  // Make sure the year is preserved in slug
  if (typeof movie.slug === 'string') {
    const yearMatch = (movie.slug as string).match(/\-(\d{4})$/);
    if (yearMatch) {
      transformed.slug = `${transformed.slug}-${yearMatch[1]}`;
    }
  }

  if (typeof transformed.title_english === 'string') {
    transformed.title_english = transformMovieTitle(transformed.title_english as string);
  }

  if (typeof transformed.title_long === 'string') {
    if (typeof movie.title === 'string') {
      transformed.title_long = transformMovieTitle(movie.title as string, 3);
    } else {
      transformed.title_long = transformMovieTitle(transformed.title_long as string);
    }

    // Make sure the year is preserved in title_long
    const yearMatch = (movie.title_long as string).match(/\((\d{4})\)$/);
    if (yearMatch) {
      transformed.title_long = `${transformed.title_long} (${yearMatch[1]})`;
    }
  }

  const transformUrl = (url: string) => {
    if (typeof movie.slug === 'string' && typeof transformed.slug === 'string') {
      return url
        .replaceAll(movie.slug, transformed.slug)
        .replaceAll(movie.slug.replaceAll(/-/g, '_'), transformed.slug.replaceAll(/-/g, '_'));
    }
  };

  // Transform URLs
  if (typeof transformed.url === 'string') {
    transformed.url = transformUrl(transformed.url);
  }

  // Transform image URLs
  [
    'background_image',
    'background_image_original',
    'small_cover_image',
    'medium_cover_image',
    'large_cover_image',
    'medium_screenshot_image1',
    'medium_screenshot_image2',
    'medium_screenshot_image3',
    'large_screenshot_image1',
    'large_screenshot_image2',
    'large_screenshot_image3',
  ].forEach(key => {
    if (
      typeof transformed[key] === 'string' &&
      typeof movie.slug === 'string' &&
      typeof transformed.slug === 'string'
    ) {
      transformed[key] = transformUrl(transformed[key]);
    }
  });

  // Transform cast members if present
  if (Array.isArray(transformed.cast)) {
    transformed.cast = (transformed.cast as unknown[]).map(castMember => {
      if (typeof castMember === 'object' && castMember !== null) {
        const transformedCastMember = { ...(castMember as Record<string, unknown>) };

        // Transform actor image URL if present
        if (typeof transformedCastMember.url_small_image === 'string') {
          transformedCastMember.url_small_image = transformUrl(
            transformedCastMember.url_small_image
          );
        }

        return transformedCastMember;
      }
      return castMember;
    });
  }

  // Transform torrents
  if (Array.isArray(transformed.torrents)) {
    transformed.torrents = (transformed.torrents as unknown[]).map(torrent => {
      if (typeof torrent === 'object' && torrent !== null) {
        const transformedTorrent = { ...(torrent as Record<string, unknown>) };

        // Transform torrent hash
        if (typeof transformedTorrent.hash === 'string') {
          transformedTorrent.hash = createHash(
            hashString(transformedTorrent.hash),
            transformedTorrent.hash.length
          );
        }

        // Transform torrent URL
        if (typeof transformedTorrent.url === 'string') {
          const hash =
            typeof transformedTorrent.hash === 'string'
              ? transformedTorrent.hash
              : createHash(hashString(transformedTorrent.url), 40);
          transformedTorrent.url = transformedTorrent.url
            .toString()
            .replace(/\/download\/([A-F0-9]+)/, `/download/${hash}`);
        }

        return transformedTorrent;
      }
      return torrent;
    });
  }

  return transformed;
}

/**
 * Transforms a movie title deterministically
 */
function transformMovieTitle(title: string, length = 2): string {
  const seed = hashString(title);
  const adjectives = [
    'Happy',
    'Sunny',
    'Joyful',
    'Bright',
    'Peaceful',
    'Gentle',
    'Sweet',
    'Calm',
    'Eager',
    'Kind',
    'Brave',
    'Noble',
    'Clever',
    'Witty',
    'Friendly',
  ];
  const nouns = [
    'Adventure',
    'Journey',
    'Voyage',
    'Quest',
    'Tale',
    'Story',
    'Legend',
    'Dream',
    'Day',
    'Life',
    'Path',
    'Friendship',
    'Experience',
    'Discovery',
  ];

  return `The ${Array.from({ length }, (_, index) => (index % 2 === 0 ? adjectives[seed ** (index + 1) % adjectives.length] : nouns[seed ** (index + 1) % nouns.length])).join(' ')}`;
}

/**
 * Simple hash function to create a deterministic numeric value from a string
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Creates a hash of a given length from a seed number
 */
function createHash(seed: number, length: number): string {
  return Array.from({
    length: Math.floor(length / 2),
  })
    .map((_, index) => {
      return (seed ** (index + 1)).toString(16);
    })
    .join('')
    .substring(0, length)
    .toUpperCase();
}
