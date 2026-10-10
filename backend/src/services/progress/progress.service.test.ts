jest.mock('@logger', () => ({ logger: { warn: jest.fn() } }));

import type { Database } from '@database/database';
import type { Progress } from '@entities/progress.entity';
import type { ProgressUpdateRequest } from '@routes/progress.types';
import type { ListClientService } from '@services/list/list-client.service';

import { ProgressService } from './progress.service';

const update: ProgressUpdateRequest = {
  playable: { kind: 'movie', mediaId: 123 },
  positionSeconds: 30,
  durationSeconds: 100,
  state: 'paused',
};

const setupTest = (withClient = true) => {
  const repository = {
    upsert: jest.fn().mockResolvedValue({}),
    findByUser: jest.fn().mockResolvedValue([]),
  };
  const database = { getProgressRepository: () => repository } as unknown as Database;
  const listClient = {
    isReady: jest.fn().mockReturnValue(true),
    syncPlayback: jest.fn().mockResolvedValue(undefined),
    getPlayback: jest.fn().mockResolvedValue([]),
  };
  const service = new ProgressService(
    database,
    withClient ? (listClient as unknown as ListClientService) : undefined
  );
  return { service, repository, listClient };
};

describe('ProgressService', () => {
  it('saves local progress before exporting for the same user', async () => {
    const { service, repository, listClient } = setupTest();
    listClient.syncPlayback.mockImplementation(async () => {
      expect(repository.upsert).toHaveBeenCalledWith('user-1', update);
    });
    await service.update('user-1', update);
    expect(listClient.syncPlayback).toHaveBeenCalledWith('user-1', update);
  });

  it('retains a successful local save when export fails', async () => {
    const { service, repository, listClient } = setupTest();
    listClient.syncPlayback.mockRejectedValue(new Error('offline'));
    await expect(service.update('user-1', update)).resolves.toBeUndefined();
    expect(repository.upsert).toHaveBeenCalledWith('user-1', update);
  });

  it('propagates a failed local save without exporting', async () => {
    const { service, repository, listClient } = setupTest();
    const error = new Error('database unavailable');
    repository.upsert.mockRejectedValue(error);
    await expect(service.update('user-1', update)).rejects.toBe(error);
    expect(listClient.syncPlayback).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'supports local progress when client absent or unready (present: %s)',
    async withClient => {
      const { service, repository, listClient } = setupTest(withClient);
      listClient.isReady.mockReturnValue(false);
      await service.update('user-1', update);
      await expect(service.findByUser('user-1')).resolves.toEqual([]);
      expect(repository.findByUser).toHaveBeenCalledWith('user-1');
      expect(listClient.syncPlayback).not.toHaveBeenCalled();
      expect(listClient.getPlayback).not.toHaveBeenCalled();
    }
  );

  it('maps local movies and episodes and retains them on import failure', async () => {
    const { service, repository, listClient } = setupTest();
    const updatedAt = new Date('2026-10-04T10:00:00Z');
    const row = { positionSeconds: 30, durationSeconds: 100, state: 'paused', updatedAt };
    repository.findByUser.mockResolvedValue([
      { ...row, playableKind: 'movie', playableKey: 'm:123' },
      { ...row, playableKind: 'episode', playableKey: 'e:42:0:2' },
    ] as Progress[]);
    listClient.getPlayback.mockRejectedValue(new Error('offline'));
    await expect(service.findByUser('user-1')).resolves.toEqual([
      { ...update, updatedAt: updatedAt.toISOString() },
      {
        ...update,
        playable: { kind: 'episode', showMediaId: 42, seasonNumber: 0, episodeNumber: 2 },
        updatedAt: updatedAt.toISOString(),
      },
    ]);
    expect(listClient.getPlayback).toHaveBeenCalledWith('user-1');
    expect(repository.findByUser).toHaveBeenCalledWith('user-1');
  });

  it('merges newer remote progress without persisting or exporting imported entries', async () => {
    const { service, repository, listClient } = setupTest();
    repository.findByUser.mockResolvedValue([
      {
        ...update,
        playableKind: 'movie',
        playableKey: 'm:123',
        updatedAt: new Date('2026-10-04T10:00:00Z'),
      },
    ]);
    const remote = { ...update, positionSeconds: 60, updatedAt: '2026-10-04T11:00:00Z' };
    listClient.getPlayback.mockResolvedValue([remote]);
    await expect(service.findByUser('user-1')).resolves.toEqual([remote]);
    expect(repository.upsert).not.toHaveBeenCalled();
    expect(listClient.syncPlayback).not.toHaveBeenCalled();
  });

  it('propagates repository read failures', async () => {
    const { service, repository } = setupTest();
    const error = new Error('database unavailable');
    repository.findByUser.mockRejectedValue(error);
    await expect(service.findByUser('user-1')).rejects.toBe(error);
  });
});
