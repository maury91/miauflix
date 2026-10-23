import { faker } from '@faker-js/faker';

import type { Storage } from '@entities/storage.entity';

import { createMockContentSource } from './movie.mock';

export function createMockStorage(overrides: Partial<Storage> = {}): Storage {
  const sourceId = overrides.sourceId ?? faker.number.int({ min: 1, max: 100000 });
  const contentSource = overrides.contentSource ?? createMockContentSource({ id: sourceId });

  return {
    id: overrides.id ?? faker.number.int({ min: 1, max: 100000 }),
    contentSource,
    sourceId,
    downloadedPieces: overrides.downloadedPieces ?? new Uint8Array(0),
    size: overrides.size ?? faker.number.int({ min: 1024 * 1024, max: 10 * 1024 * 1024 * 1024 }), // 1MB to 10GB
    logicalBytes: overrides.logicalBytes ?? overrides.size ?? 0,
    verifiedBytes: overrides.verifiedBytes ?? 0,
    allocatedBytes: overrides.allocatedBytes ?? 0,
    reservedBytes: overrides.reservedBytes ?? 0,
    totalPieces: overrides.totalPieces ?? 0,
    pieceLength: overrides.pieceLength ?? 0,
    lastInterestAt: overrides.lastInterestAt ?? null,
    videoCompletedAt: overrides.videoCompletedAt ?? null,
    localOnly: overrides.localOnly ?? false,
    encryptedLayout: overrides.encryptedLayout ?? null,
    activeStreams: overrides.activeStreams ?? 0,
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
  const sourceId = overrides.sourceId ?? faker.number.int({ min: 1, max: 100000 });
  const contentSource = createMockContentSource({
    id: sourceId,
    hash,
    ...overrides.contentSource,
  });

  return createMockStorage({
    sourceId,
    contentSource,
    ...overrides,
  });
}

export function createMockStorageWithoutContentSource(overrides: Partial<Storage> = {}): Storage {
  return createMockStorage({
    contentSource: undefined,
    ...overrides,
  });
}

export function createMockStorageWithUndefinedHash(overrides: Partial<Storage> = {}): Storage {
  const sourceId = overrides.sourceId ?? faker.number.int({ min: 1, max: 100000 });
  const contentSource = createMockContentSource({
    id: sourceId,
    hash: undefined,
    ...overrides.contentSource,
  });

  return createMockStorage({
    sourceId,
    contentSource,
    ...overrides,
  });
}

export function createMockStorages(count = 2): Storage[] {
  return Array.from({ length: count }, () => createMockStorage());
}
