import type { EntityTarget, ObjectLiteral, Repository } from 'typeorm';

import type { Episode } from '@entities/episode.entity';
import type { Genre } from '@entities/genre.entity';
import type { Movie } from '@entities/movie.entity';
import type { MovieSource } from '@entities/movie-source.entity';
import type { RefreshToken } from '@entities/refresh-token.entity';
import type { Storage } from '@entities/storage.entity';
import type { StreamingKey } from '@entities/streaming-key.entity';
import type { User } from '@entities/user.entity';
import { UserRole } from '@entities/user.entity';
import type { AuditLogRepository } from '@repositories/audit-log.repository';
import type { GenreRepository } from '@repositories/genre.repository';
import type { MediaListRepository } from '@repositories/mediaList.repository';
import type { MovieRepository } from '@repositories/movie.repository';
import type { MovieSourceRepository } from '@repositories/movie-source.repository';
import type { ProgressRepository } from '@repositories/progress.repository';
import type { RefreshTokenRepository } from '@repositories/refresh-token.repository';
import type { StorageRepository } from '@repositories/storage.repository';
import type { StreamingKeyRepository } from '@repositories/streaming-key.repository';
import type { SyncStateRepository } from '@repositories/syncState.repository';
import type { TraktUserRepository } from '@repositories/trakt-user.repository';
import type { TVShowRepository } from '@repositories/tvshow.repository';
import type { UserRepository } from '@repositories/user.repository';
import type { EncryptionService } from '@services/encryption/encryption.service';

// Mock MovieRepository
const createMockMovieRepository = (): jest.Mocked<MovieRepository> => {
  return {
    findByTMDBId: jest.fn(
      (_tmdbId: number | string): Promise<Movie | null> => Promise.resolve(null)
    ),
    create: jest.fn(details =>
      Promise.resolve({
        id: 1,
        tmdbId: details.tmdbId,
        title: details.title,
        overview: details.overview,
        tagline: details.tagline,
        releaseDate: details.releaseDate,
        poster: details.poster,
        backdrop: details.backdrop,
        logo: details.logo,
        runtime: details.runtime,
        popularity: details.popularity,
        rating: details.rating,
        genres: details.genres || [],
        translations: [],
      } as unknown as Movie)
    ),
    addTranslation: jest.fn(() => Promise.resolve({})),
    checkForChangesAndUpdate: jest.fn(() => Promise.resolve({})),
    updateGenres: jest.fn(() => Promise.resolve({})),
    findByIds: jest.fn(() => Promise.resolve([])),
    findById: jest.fn(() => Promise.resolve(null)),
    findMoviesPendingSourceSearch: jest.fn(() => Promise.resolve([])),
    findMoviesWithoutSources: jest.fn(() => Promise.resolve([])),
  } as unknown as jest.Mocked<MovieRepository>;
};

// Mock GenreRepository
const createMockGenreRepository = (): jest.Mocked<GenreRepository> => {
  return {
    findAll: jest.fn(() =>
      Promise.resolve([
        { id: 1, name: 'Action', translations: [{ language: 'en' }] },
      ] as unknown as Genre[])
    ),
    createOrGetGenre: jest.fn(id =>
      Promise.resolve({
        id,
        name: 'Mocked Genre',
        translations: [{ language: 'en' }],
      } as unknown as Genre)
    ),
    createTranslation: jest.fn(() => Promise.resolve()),
  } as unknown as jest.Mocked<GenreRepository>;
};

// Mock SyncStateRepository
const createMockSyncStateRepository = (): jest.Mocked<SyncStateRepository> => {
  return {
    getLastSync: jest.fn((): Promise<Date | null> => Promise.resolve(null)),
    setLastSync: jest.fn((): Promise<void> => Promise.resolve()),
    getByName: jest.fn(() => Promise.resolve(null)),
  } as unknown as jest.Mocked<SyncStateRepository>;
};

// Mock MovieSourceRepository
const createMockMovieSourceRepository = (): jest.Mocked<MovieSourceRepository> => {
  return {
    create: jest.fn((source: Partial<MovieSource>) =>
      Promise.resolve({ id: 1, ...source } as MovieSource)
    ),
    createMany: jest.fn(() => Promise.resolve([])),
    findByMovieId: jest.fn(() => Promise.resolve([])),
    findByMovieAndHash: jest.fn(() => Promise.resolve(null)),
    getRepository: jest.fn(() => ({}) as Repository<MovieSource>),
    findSourcesToProcess: jest.fn(() => Promise.resolve([])),
    updateStats: jest.fn(() => Promise.resolve()),
    findBestSourceForMovie: jest.fn(() => Promise.resolve(null)),
  } as unknown as jest.Mocked<MovieSourceRepository>;
};

const createMockUser = (overrides: Partial<User> = {}): User => {
  const now = new Date();
  return {
    id: 'user-123',
    email: 'mock@example.com',
    passwordHash: '',
    role: UserRole.USER,
    isEmailVerified: false,
    displayName: null,
    refreshTokens: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

const createMockRefreshToken = (overrides: Partial<RefreshToken> = {}): RefreshToken => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 86400000);
  const baseUser = createMockUser();
  return {
    id: 'token-123',
    tokenHash: 'mock-token-hash',
    expiresAt,
    userId: 'user-123',
    session: 'mock-session',
    userAgent: null,
    lastIpAddress: null,
    lastAccessedAt: now,
    accessCount: 1,
    issueIpAddress: null,
    user: baseUser,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

// Mock UserRepository
const createMockUserRepository = (): jest.Mocked<UserRepository> => {
  return {
    findByEmail: jest.fn(() => Promise.resolve(null)),
    findByRole: jest.fn(() => Promise.resolve([])),
    create: jest.fn(user => Promise.resolve(createMockUser(user as Partial<User>))),
    findById: jest.fn(() => Promise.resolve(null)),
    update: jest.fn(() => Promise.resolve(null)),
    delete: jest.fn(() => Promise.resolve(false)),
    saveUser: jest.fn(user => Promise.resolve(createMockUser(user as Partial<User>))),
  } as unknown as jest.Mocked<UserRepository>;
};

// Mock RefreshTokenRepository
const createMockRefreshTokenRepository = (): jest.Mocked<RefreshTokenRepository> => {
  return {
    findByToken: jest.fn(() => Promise.resolve(null)),
    create: jest.fn((tokenData: Partial<RefreshToken> & { token?: string }) => {
      const { token: _omit, ...rest } = tokenData;
      void _omit; // Raw token is hashed in real impl; omitted in mock
      return Promise.resolve(createMockRefreshToken({ ...rest, id: 'token-123' }));
    }),
    updateToken: jest.fn(() => Promise.resolve(false)),
    isChainExpired: jest.fn(() => Promise.resolve(false)),
    delete: jest.fn(() => Promise.resolve(false)),
    countByUser: jest.fn(() => Promise.resolve(0)),
    deleteOldestByUser: jest.fn(() => Promise.resolve(false)),
    deleteByUserAndSession: jest.fn(() => Promise.resolve(false)),
    findById: jest.fn(() => Promise.resolve(null)),
    findByUser: jest.fn(() => Promise.resolve([])),
    deleteByUser: jest.fn(() => Promise.resolve(false)),
    deleteExpired: jest.fn(() => Promise.resolve(0)),
    saveRefreshToken: jest.fn(token => Promise.resolve(createMockRefreshToken(token))),
    findByUserAndSession: jest.fn(() => Promise.resolve(null)),
  } as unknown as jest.Mocked<RefreshTokenRepository>;
};

// Mock StreamingKeyRepository (used by AuthService)
const createMockStreamingKeyRepository = (): jest.Mocked<StreamingKeyRepository> => {
  return {
    create: jest.fn(() => Promise.resolve({} as unknown as StreamingKey)),
    findByKeyHash: jest.fn(() => Promise.resolve(null)),
    deleteByKeyHash: jest.fn(() => Promise.resolve()),
    deleteExpired: jest.fn(() => Promise.resolve(0)),
    deleteByUserId: jest.fn(() => Promise.resolve(0)),
    deleteByMovieId: jest.fn(() => Promise.resolve(0)),
  } as unknown as jest.Mocked<StreamingKeyRepository>;
};

// Mock StorageRepository
const createMockStorageRepository = (): jest.Mocked<StorageRepository> => {
  return {
    findById: jest.fn(() => Promise.resolve(null)),
    findByMovieSourceId: jest.fn(() => Promise.resolve(null)),
    findByMovieSourceIdWithRelation: jest.fn(() => Promise.resolve(null)),
    create: jest.fn((storage: Partial<Storage>) =>
      Promise.resolve({ id: 1, ...storage } as Storage)
    ),
    update: jest.fn(() => Promise.resolve(null)),
    delete: jest.fn(() => Promise.resolve(false)),
    deleteByMovieSourceId: jest.fn(() => Promise.resolve(false)),
    updateLastAccess: jest.fn(() => Promise.resolve()),
    updateDownloadProgress: jest.fn(() => Promise.resolve()),
    findOldUnaccessed: jest.fn(() => Promise.resolve([])),
    findMostStaleStorage: jest.fn(() => Promise.resolve(null)),
    getStorageCount: jest.fn(() => Promise.resolve(0)),
    getTotalStorageUsage: jest.fn(() => Promise.resolve(BigInt(0))),
    findByDownloadedRange: jest.fn(() => Promise.resolve([])),
  } as unknown as jest.Mocked<StorageRepository>;
};

// Mock Database class
export class Database {
  private movieRepository: jest.Mocked<MovieRepository>;
  private genreRepository: jest.Mocked<GenreRepository>;
  private syncStateRepository: jest.Mocked<SyncStateRepository>;
  private tvShowRepository: jest.Mocked<TVShowRepository>;
  private progressRepository: jest.Mocked<ProgressRepository>;
  private seasonRepository: jest.Mocked<Record<string, unknown>>;
  private mediaListRepository: jest.Mocked<MediaListRepository>;
  private movieSourceRepository: jest.Mocked<MovieSourceRepository>;
  private userRepository: jest.Mocked<UserRepository>;
  private refreshTokenRepository: jest.Mocked<RefreshTokenRepository>;
  private auditLogRepository: jest.Mocked<AuditLogRepository>;
  private traktUserRepository: jest.Mocked<TraktUserRepository>;
  private storageRepository: jest.Mocked<StorageRepository>;
  private streamingKeyRepository: jest.Mocked<StreamingKeyRepository>;

  // Make getter methods jest mocks so they can be overridden
  public getMovieRepository: jest.Mock;
  public getTVShowRepository: jest.Mock;
  public getGenreRepository: jest.Mock;
  public getSyncStateRepository: jest.Mock;
  public getProgressRepository: jest.Mock;
  public getSeasonRepository: jest.Mock;
  public getMediaListRepository: jest.Mock;
  public getMovieSourceRepository: jest.Mock;
  public getUserRepository: jest.Mock;
  public getRefreshTokenRepository: jest.Mock;
  public getAuditLogRepository: jest.Mock;
  public getTraktUserRepository: jest.Mock;
  public getStorageRepository: jest.Mock;
  public getStreamingKeyRepository: jest.Mock;

  constructor(_encryptionService?: EncryptionService) {
    // Initialize all repositories with default mocks
    this.movieRepository = createMockMovieRepository();
    this.genreRepository = createMockGenreRepository();
    this.syncStateRepository = createMockSyncStateRepository();
    this.tvShowRepository = {} as jest.Mocked<TVShowRepository>;
    this.progressRepository = {} as jest.Mocked<ProgressRepository>;
    this.seasonRepository = {} as jest.Mocked<Record<string, unknown>>;
    this.mediaListRepository = {} as jest.Mocked<MediaListRepository>;
    this.movieSourceRepository = createMockMovieSourceRepository();
    this.userRepository = createMockUserRepository();
    this.refreshTokenRepository = createMockRefreshTokenRepository();
    this.auditLogRepository = {} as jest.Mocked<AuditLogRepository>;
    this.traktUserRepository = {} as jest.Mocked<TraktUserRepository>;
    this.storageRepository = createMockStorageRepository();
    this.streamingKeyRepository = createMockStreamingKeyRepository();

    // Initialize getter methods as jest mocks that return the repositories
    this.getMovieRepository = jest.fn(() => this.movieRepository);
    this.getTVShowRepository = jest.fn(() => this.tvShowRepository);
    this.getGenreRepository = jest.fn(() => this.genreRepository);
    this.getSyncStateRepository = jest.fn(() => this.syncStateRepository);
    this.getProgressRepository = jest.fn(() => this.progressRepository);
    this.getSeasonRepository = jest.fn(() => this.seasonRepository);
    this.getMediaListRepository = jest.fn(() => this.mediaListRepository);
    this.getMovieSourceRepository = jest.fn(() => this.movieSourceRepository);
    this.getUserRepository = jest.fn(() => this.userRepository);
    this.getRefreshTokenRepository = jest.fn(() => this.refreshTokenRepository);
    this.getAuditLogRepository = jest.fn(() => this.auditLogRepository);
    this.getTraktUserRepository = jest.fn(() => this.traktUserRepository);
    this.getStorageRepository = jest.fn(() => this.storageRepository);
    this.getStreamingKeyRepository = jest.fn(() => this.streamingKeyRepository);
  }

  async initialize(): Promise<void> {
    // Mock implementation - no-op
  }

  async close(): Promise<void> {
    // Mock implementation - no-op
  }

  getRepository<T extends ObjectLiteral>(_entity: EntityTarget<T>): Repository<T> {
    return {} as Repository<T>;
  }

  getEpisodeRepository(): Repository<Episode> {
    return {} as Repository<Episode>;
  }
}
