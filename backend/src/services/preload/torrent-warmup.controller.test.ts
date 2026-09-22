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
  });

  it('does not start speculative payload work while playback is active', async () => {
    const { controller, driver } = setupTest();
    driver.hasActivePlayback.mockReturnValue(true);

    const state = await controller.warm(source(1), 'm:1', 'm:1');

    expect(state.state).toBe('paused');
    expect(driver.warmSource).not.toHaveBeenCalled();
  });
});
