import 'reflect-metadata';

import { DataSource } from 'typeorm';

import type { Database } from '@database/database';
import { RecentSearch } from '@entities/recent-search.entity';
import { RefreshToken } from '@entities/refresh-token.entity';
import { User } from '@entities/user.entity';

import { MAX_RECENT_SEARCHES, RecentSearchRepository } from './recent-search.repository';

const setupTest = async () => {
  const dataSource = await new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: [RecentSearch, User, RefreshToken],
    synchronize: true,
  }).initialize();
  await dataSource.getRepository(User).insert([
    { id: 'user-1', email: 'one@example.com', passwordHash: 'unused' },
    { id: 'user-2', email: 'two@example.com', passwordHash: 'unused' },
  ]);
  const db = {
    getRepository: (entity: typeof RecentSearch) => dataSource.getRepository(entity),
  } as unknown as Database;
  return { dataSource, repository: new RecentSearchRepository(db) };
};

const at = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds));

describe('RecentSearchRepository', () => {
  it('lists newest first, folds case, isolates users and removes entries', async () => {
    const { dataSource, repository } = await setupTest();
    try {
      await repository.record('user-1', 'query', 'dune', at(1));
      await repository.record('user-1', 'genre', 'anime', at(2));
      await repository.record('user-1', 'query', ' Dune ', at(3));
      await repository.record('user-2', 'query', 'Silo', at(4));

      const entries = await repository.list('user-1');
      expect(entries.map(entry => [entry.kind, entry.query])).toEqual([
        ['query', 'Dune'],
        ['genre', 'anime'],
      ]);

      await repository.remove('user-1', 'query', 'DUNE');
      expect((await repository.list('user-1')).map(entry => entry.query)).toEqual(['anime']);
      expect((await repository.list('user-2')).map(entry => entry.query)).toEqual(['Silo']);
    } finally {
      await dataSource.destroy();
    }
  });

  it('keeps only the most recent searches', async () => {
    const { dataSource, repository } = await setupTest();
    try {
      for (let index = 0; index <= MAX_RECENT_SEARCHES; index++) {
        await repository.record('user-1', 'query', `query ${index}`, at(index));
      }
      const entries = await repository.list('user-1', 100);
      expect(entries).toHaveLength(MAX_RECENT_SEARCHES);
      expect(entries.at(0)?.query).toBe(`query ${MAX_RECENT_SEARCHES}`);
      expect(entries.map(entry => entry.query)).not.toContain('query 0');
    } finally {
      await dataSource.destroy();
    }
  });
});
