import type { MovieSource } from '@entities/movie-source.entity';

import { TorrentWarmupController, type TorrentWarmupDriver } from './torrent-warmup.controller';

const source = (id: number) => ({ id, size: 100, file: Buffer.from('torrent') }) as MovieSource;

describe('TorrentWarmupController', () => {
  const setupTest = () => {
    const driver: jest.Mocked<TorrentWarmupDriver> = {
      warmSource: jest.fn(async (item: MovieSource, targetBytes: number) => ({
        sourceId: item.id,
        targetBytes,
        firstPiece: 0,
        lastPiece: 2,
      })),
      pauseSource: jest.fn(async (_sourceId: number) => true),
      promoteSource: jest.fn(async (_source: MovieSource) => true),
      hasActivePlayback: jest.fn(() => false),
      isPlaybackActive: jest.fn((_sourceId: number) => false),
    };
    return { controller: new TorrentWarmupController(driver), driver };
  };

  it('keeps one speculative source and pauses the previous source before replacement', async () => {
    const { controller, driver } = setupTest();

    await controller.warm(source(1), 'lease-a', 'm:1');
    await controller.warm(source(2), 'lease-b', 'm:2');

    expect(driver.pauseSource).toHaveBeenCalledWith(1);
    expect(controller.getState()).toMatchObject({
      sourceId: 2,
      playableKey: 'm:2',
      state: 'warming',
    });
    expect(driver.warmSource).toHaveBeenCalledTimes(2);
  });

  it('promotes the exact source without ranking a replacement', async () => {
    const { controller, driver } = setupTest();
    await controller.warm(source(1), 'm:1', 'm:1');

    await expect(controller.promote(source(1), 'm:1')).resolves.toBe(true);
    expect(driver.promoteSource).toHaveBeenCalledWith(source(1));
    expect(driver.pauseSource).not.toHaveBeenCalled();
    expect(controller.getState()).toBeNull();
  });

  it('keeps the slot when promotion returns false or rejects', async () => {
    const { controller, driver } = setupTest();
    await controller.warm(source(1), 'm:1', 'm:1');
    const slot = controller.getState();

    driver.promoteSource.mockResolvedValueOnce(false);
    await expect(controller.promote(source(1), 'm:1')).resolves.toBe(false);
    expect(controller.getState()).toEqual(slot);

    driver.promoteSource.mockRejectedValueOnce(new Error('promotion failed'));
    await expect(controller.promote(source(1), 'm:1')).rejects.toThrow('promotion failed');
    expect(controller.getState()).toEqual(slot);
  });

  it('keeps a different source slot when promoting another source', async () => {
    const { controller, driver } = setupTest();
    await controller.warm(source(1), 'm:1', 'm:1');
    const slot = controller.getState();

    await expect(controller.promote(source(2), 'm:2')).resolves.toBe(true);

    expect(controller.getState()).toEqual(slot);
    expect(driver.pauseSource).not.toHaveBeenCalled();
  });

  it('does not start speculative payload work while playback is active', async () => {
    const { controller, driver } = setupTest();
    driver.hasActivePlayback.mockReturnValue(true);

    const state = await controller.warm(source(1), 'm:1', 'm:1');

    expect(state.state).toBe('paused');
    expect(driver.warmSource).not.toHaveBeenCalled();
  });

  it('pauses and persists an existing speculative slot while playback is active', async () => {
    const { controller, driver } = setupTest();
    await controller.warm(source(1), 'lease-a', 'm:1');
    driver.hasActivePlayback.mockReturnValue(true);

    const state = await controller.warm(source(2), 'lease-b', 'm:2');

    expect(driver.pauseSource).toHaveBeenCalledWith(1);
    expect(state).toMatchObject({ sourceId: 1, state: 'paused' });
    expect(controller.getState()).toMatchObject({ sourceId: 1, state: 'paused' });
    expect(driver.warmSource).toHaveBeenCalledTimes(1);
  });

  it('does not pause a slot whose source is the active playback', async () => {
    const { controller, driver } = setupTest();
    await controller.warm(source(1), 'lease-a', 'm:1');
    driver.hasActivePlayback.mockReturnValue(true);
    driver.isPlaybackActive.mockImplementation(sourceId => sourceId === 1);

    const state = await controller.warm(source(2), 'lease-b', 'm:2');

    expect(driver.pauseSource).not.toHaveBeenCalled();
    expect(state).toMatchObject({ sourceId: 1, state: 'warming' });
    expect(controller.getState()).toMatchObject({ sourceId: 1, state: 'warming' });
  });

  it('keeps the slot warming when pausing it fails', async () => {
    const { controller, driver } = setupTest();
    await controller.warm(source(1), 'lease-a', 'm:1');
    driver.hasActivePlayback.mockReturnValue(true);
    driver.pauseSource.mockResolvedValueOnce(false);

    const state = await controller.warm(source(2), 'lease-b', 'm:2');

    expect(state).toMatchObject({ sourceId: 1, state: 'warming' });
    expect(controller.getState()).toMatchObject({ sourceId: 1, state: 'warming' });
  });

  it('warms the same lease again after it was paused', async () => {
    const { controller, driver } = setupTest();
    await controller.warm(source(1), 'm:1', 'm:1');
    await controller.pause('m:1');

    const resumed = await controller.warm(source(1), 'm:1', 'm:1');

    expect(driver.warmSource).toHaveBeenCalledTimes(2);
    expect(resumed.state).toBe('warming');
    expect(resumed.generation).toBeGreaterThan(1);
  });

  it('retries the same lease after its previous warm attempt failed', async () => {
    const { controller, driver } = setupTest();
    driver.warmSource.mockRejectedValueOnce(new Error('temporary torrent failure'));

    await expect(controller.warm(source(1), 'm:1', 'm:1')).rejects.toThrow(
      'temporary torrent failure'
    );
    const retried = await controller.warm(source(1), 'm:1', 'm:1');

    expect(driver.warmSource).toHaveBeenCalledTimes(2);
    expect(retried.state).toBe('warming');
    expect(retried.generation).toBeGreaterThan(1);
  });
});
