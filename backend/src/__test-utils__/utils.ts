import { faker } from '@faker-js/faker';

/**
 * Configure Faker with a seed for reproducible tests
 * @param seed - Optional seed for reproducible results. Uses a default seed if not provided.
 */
export function configureFakerSeed(seed = 12345): void {
  faker.seed(seed);
}

/**
 * Create a delayed promise that resolves after the specified timeout
 * Used for testing async operations with timeouts
 */
export function delayedResult<T>(result: T, delay: number): Promise<T> {
  return new Promise(resolve => {
    setTimeout(() => resolve(result), delay);
  });
}

/**
 * Generate a random IMDB ID
 */
export function generateImdbId(): string {
  return `tt${faker.string.numeric(7)}`;
}

/**
 * Generate a random torrent hash
 */
export function generateTorrentHash(): string {
  return faker.string.alphanumeric(40).toLowerCase();
}

/**
 * Generate a random magnet link using the provided hash
 */
export function generateMagnetLink(hash: string, title?: string): string {
  const encodedTitle = title ? `&dn=${encodeURIComponent(title)}` : '';
  return `magnet:?xt=urn:btih:${hash}${encodedTitle}`;
}

/**
 * Generate random movie metadata
 */
export function generateMovieMetadata() {
  return {
    title: faker.lorem.words(faker.number.int({ min: 1, max: 4 })),
    overview: faker.lorem.paragraphs(faker.number.int({ min: 1, max: 3 })),
    tagline: faker.lorem.sentence(),
    runtime: faker.number.int({ min: 60, max: 180 }),
    rating: faker.number.float({ min: 1, max: 10, fractionDigits: 1 }),
    popularity: faker.number.float({ min: 0, max: 100, fractionDigits: 1 }),
    releaseDate: faker.date.past({ years: 20 }).toISOString().split('T')[0],
    poster: `/posters/${faker.string.alphanumeric(8)}.jpg`,
    backdrop: `/backdrops/${faker.string.alphanumeric(8)}.jpg`,
    logo: `/logos/${faker.string.alphanumeric(8)}.png`,
  };
}

/**
 * Generate random source metadata
 */
export function generateSourceMetadata() {
  return {
    hash: generateTorrentHash(),
    bitrate: faker.number.int({ min: 1000, max: 5000 }),
    broadcasters: faker.number.int({ min: 10, max: 200 }),
    watchers: faker.number.int({ min: 1, max: 50 }),
    size: faker.number.int({ min: 500000000, max: 3000000000 }),
    uploadDate: faker.date.past({ years: 2 }),
    url: faker.internet.url(),
  };
}
