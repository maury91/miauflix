import { faker } from '@faker-js/faker';

import type { Storage } from '@entities/storage.entity';

import { createMockMovieSource } from './movie.mock';

export function createMockStorage(overrides: Partial<Storage> = {}): Storage {
  const movieSourceId = overrides.movieSourceId ?? faker.number.int({ min: 1, max: 100000 });
  const movieSource = overrides.movieSource ?? createMockMovieSource({ id: movieSourceId });

  return {
    id: overrides.id ?? faker.number.int({ min: 1, max: 100000 }),
    movieSource,
    movieSourceId,
    downloadedPieces: overrides.downloadedPieces ?? new Uint8Array(0),
    size: overrides.size ?? faker.number.int({ min: 1024 * 1024, max: 10 * 1024 * 1024 * 1024 }), // 1MB to 10GB
    downloaded: overrides.downloaded ?? faker.number.int({ min: 0, max: 10000 }), // 0-100% in basis points
    location: overrides.location ?? faker.system.filePath(),
    lastAccessAt: overrides.lastAccessAt ?? (faker.datatype.boolean() ? faker.date.recent() : null),
    lastWriteAt: overrides.lastWriteAt ?? (faker.datatype.boolean() ? faker.date.recent() : null),
    createdAt: overrides.createdAt ?? faker.date.past(),
    updatedAt: overrides.updatedAt ?? faker.date.recent(),
    ...overrides,
  };
}

export function createMockStorageWithHash(hash: string, overrides: Partial<Storage> = {}): Storage {
  const movieSourceId = overrides.movieSourceId ?? faker.number.int({ min: 1, max: 100000 });
  const movieSource = createMockMovieSource({
    id: movieSourceId,
    hash,
    ...overrides.movieSource,
  });

  return createMockStorage({
    movieSourceId,
    movieSource,
    ...overrides,
  });
}

export function createMockStorageWithoutMovieSource(overrides: Partial<Storage> = {}): Storage {
  return createMockStorage({
    movieSource: undefined,
    ...overrides,
  });
}

export function createMockStorageWithUndefinedHash(overrides: Partial<Storage> = {}): Storage {
  const movieSourceId = overrides.movieSourceId ?? faker.number.int({ min: 1, max: 100000 });
  const movieSource = createMockMovieSource({
    id: movieSourceId,
    hash: undefined,
    ...overrides.movieSource,
  });

  return createMockStorage({
    movieSourceId,
    movieSource,
    ...overrides,
  });
}

export function createMockStorages(count = 2): Storage[] {
  return Array.from({ length: count }, () => createMockStorage());
}
