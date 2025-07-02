import { Quality, Source, VideoCodec } from '@miauflix/source-metadata-extractor';

import type { Database } from '@database/database';
import type { Movie } from '@entities/movie.entity';
import type { MovieSource } from '@entities/movie-source.entity';
import type { Storage } from '@entities/storage.entity';

/**
 * Test data factory for creating test entities with realistic data
 */
export class TestDataFactory {
  constructor(private database: Database) {}

  /**
   * Create a test movie with minimal required fields
   */
  async createTestMovie(overrides: Partial<Movie> = {}): Promise<Movie> {
    const movieRepository = this.database.getMovieRepository();

    const defaultMovie: Partial<Movie> = {
      tmdbId: Math.floor(Math.random() * 1000000),
      title: 'Test Movie',
      overview: 'A test movie for unit testing',
      runtime: 120,
      tagline: 'Test tagline',
      rating: 7.5,
      popularity: 100.0,
      releaseDate: '2023-01-01',
      poster: '/test-poster.jpg',
      backdrop: '/test-backdrop.jpg',
      logo: '/test-logo.png',
      contentDirectoriesSearched: [],
      genres: [],
      translations: [],
      ...overrides,
    };

    return movieRepository.create(defaultMovie);
  }

  /**
   * Create a test movie source with realistic data
   */
  async createTestMovieSource(
    movieId: number,
    overrides: Partial<MovieSource> = {}
  ): Promise<MovieSource> {
    const movieSourceRepository = this.database.getMovieSourceRepository();

    const defaultMovieSource: Partial<MovieSource> = {
      movieId,
      hash: '0123456789abcdef0123456789abcdef01234567', // 40 char hex string
      magnetLink: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Test+Movie+2023',
      quality: Quality.FHD,
      size: 2147483648, // 2GB
      videoCodec: VideoCodec.X264,
      source: Source.WEB,
      broadcasters: 10,
      watchers: 100,
      ...overrides,
    };

    return movieSourceRepository.create(defaultMovieSource);
  }

  /**
   * Create a test storage record
   */
  createTestStorage(movieSourceId: number, overrides: Partial<Storage> = {}): Partial<Storage> {
    const totalPieces = 1000;
    const downloadedPiecesArray = new Uint8Array(Math.ceil(totalPieces / 8));

    // Fill first few bytes to simulate partial download (about 10% downloaded)
    for (let i = 0; i < Math.min(downloadedPiecesArray.length, 12); i++) {
      downloadedPiecesArray[i] = 0xff; // All bits set for this byte
    }

    return {
      movieSourceId,
      downloadedPieces: downloadedPiecesArray,
      size: 2147483648, // 2GB
      downloaded: 1000, // 10% in basis points (10000 = 100%)
      location: `/tmp/test/movie-${movieSourceId}.mkv`,
      lastAccessAt: null,
      lastWriteAt: null,
      ...overrides,
    };
  }

  /**
   * Create a bitfield for a given number of pieces with specified completion
   */
  createBitfield(totalPieces: number, completionPercentage: number = 0): Uint8Array {
    const byteCount = Math.ceil(totalPieces / 8);
    const bitfield = new Uint8Array(byteCount);

    const piecesToSet = Math.floor((totalPieces * completionPercentage) / 100);

    for (let piece = 0; piece < piecesToSet; piece++) {
      const byteIndex = Math.floor(piece / 8);
      const bitIndex = 7 - (piece % 8);
      bitfield[byteIndex] |= 1 << bitIndex;
    }

    return bitfield;
  }

  /**
   * Create a completed bitfield (100% downloaded)
   */
  createCompleteBitfield(totalPieces: number): Uint8Array {
    return this.createBitfield(totalPieces, 100);
  }

  /**
   * Create an empty bitfield (0% downloaded)
   */
  createEmptyBitfield(totalPieces: number): Uint8Array {
    return this.createBitfield(totalPieces, 0);
  }

  /**
   * Generate a random info hash for testing
   */
  generateRandomHash(): string {
    return Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  /**
   * Generate a test magnet link
   */
  generateMagnetLink(hash: string, name: string = 'Test Movie'): string {
    return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}`;
  }
}
