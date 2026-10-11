import 'reflect-metadata';

import { DataSource } from 'typeorm';

import type { Database } from '@database/database';
import { MediaRating } from '@entities/media-rating.entity';
import { RefreshToken } from '@entities/refresh-token.entity';
import { User } from '@entities/user.entity';

import { MediaRatingRepository } from './media-rating.repository';

const setupTest = async () => {
  const dataSource = await new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: [MediaRating, User, RefreshToken],
    synchronize: true,
  }).initialize();
  await dataSource.getRepository(User).insert([
    { id: 'user-1', email: 'one@example.com', passwordHash: 'unused' },
    { id: 'user-2', email: 'two@example.com', passwordHash: 'unused' },
  ]);
  const db = {
    getRepository: (entity: typeof MediaRating) => dataSource.getRepository(entity),
  } as unknown as Database;
  return { dataSource, db, repository: new MediaRatingRepository(db) };
};

describe('durable media ratings', () => {
  it('restores ratings from storage, replaces them atomically, isolates accounts and media types, and clears them', async () => {
    const { dataSource, db, repository } = await setupTest();
    const movie = { mediaType: 'movie' as const, mediaId: 123 };
    const show = { mediaType: 'tv' as const, mediaId: 123 };
    try {
      expect(await repository.get('user-1', movie)).toBeNull();
      await repository.set('user-1', movie, 'like');
      expect(await new MediaRatingRepository(db).get('user-1', movie)).toBe('like');
      expect(await repository.get('user-2', movie)).toBeNull();
      expect(await repository.get('user-1', show)).toBeNull();
      await repository.set('user-1', movie, 'love');
      expect(await repository.get('user-1', movie)).toBe('love');
      expect(await dataSource.getRepository(MediaRating).count()).toBe(1);
      await repository.set('user-2', movie, 'dislike');
      await repository.set('user-1', movie, null);
      expect(await repository.get('user-1', movie)).toBeNull();
      expect(await repository.get('user-2', movie)).toBe('dislike');
      await dataSource.getRepository(User).delete('user-2');
      expect(await dataSource.getRepository(MediaRating).count()).toBe(0);
    } finally {
      await dataSource.destroy();
    }
  });
});
