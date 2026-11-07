jest.mock('@logger');
jest.mock('parse-torrent');

import { configureFakerSeed } from '@__test-utils__/utils';
import parseTorrent from 'parse-torrent';

import type { ConfigService } from '@mytypes/configuration';
import type { MediaLoadClientService } from '@services/media-load/media-load-client.service';
import { StatsService } from '@services/stats/stats.service';

import { SourceMetadataFileService } from './source-metadata-file.service';

const hash = 'a'.repeat(40);
const magnet = `magnet:?xt=urn:btih:${hash}`;
const setupTest = (enabled = true) => {
  const download = {
    getSourceMetadataFile: jest.fn().mockResolvedValue(Buffer.from('metadata')),
  };
  const remote = { torrentFile: jest.fn().mockResolvedValue(Buffer.from('metadata')) };
  const service = new SourceMetadataFileService(
    download as unknown as MediaLoadClientService,
    {} as never,
    new StatsService(),
    { getOrThrow: jest.fn() } as unknown as ConfigService,
    false,
    enabled,
    remote as never
  );
  return { service, remote, download };
};

describe('SourceMetadataFileService', () => {
  beforeAll(() => configureFakerSeed());
  beforeEach(() => {
    jest.useFakeTimers();
    (parseTorrent as unknown as jest.Mock).mockResolvedValue({ infoHash: hash });
  });
  afterEach(() => jest.useRealTimers());

  it('resolves background metadata through the sources service', async () => {
    const { service, remote, download } = setupTest();
    const result = service.getSourceMetadataFile(magnet, hash);
    await jest.advanceTimersByTimeAsync(1);
    expect(await result).toEqual(Buffer.from('metadata'));
    expect(remote.torrentFile).toHaveBeenCalledWith(hash);
    expect(download.getSourceMetadataFile).not.toHaveBeenCalled();
  });

  it('gets swarm stats from the media-load service', async () => {
    const swarmStats = jest.fn().mockResolvedValue({ broadcasters: 5, watchers: 1 });
    const service = new SourceMetadataFileService(
      {} as MediaLoadClientService,
      {} as never,
      new StatsService(),
      { getOrThrow: jest.fn() } as unknown as ConfigService,
      false,
      false,
      undefined,
      { swarmStats }
    );
    await expect(service.getStats(hash)).resolves.toEqual({ broadcasters: 5, watchers: 1 });
    expect(swarmStats).toHaveBeenCalledWith(hash);
  });

  it('reports stats as unavailable without the media-load service', async () => {
    const { service } = setupTest();
    await expect(service.getStats(hash)).rejects.toMatchObject({ status: 'scrape_unavailable' });
  });

  it('rejects metadata with a different info hash', async () => {
    const { service } = setupTest();
    (parseTorrent as unknown as jest.Mock).mockResolvedValue({ infoHash: 'b'.repeat(40) });
    const result = service.getSourceMetadataFile(magnet, hash);
    await jest.advanceTimersByTimeAsync(1);
    expect(await result).toBeNull();
  });

  it('shares duplicate metadata lookups and serializes different hashes', async () => {
    const { service, remote } = setupTest();
    let release!: () => void;
    remote.torrentFile.mockImplementationOnce(
      () =>
        new Promise<Buffer>(resolve => {
          release = () => resolve(Buffer.from('metadata'));
        })
    );
    const first = service.getSourceMetadataFile(magnet, hash);
    const duplicate = service.getSourceMetadataFile(magnet, hash);
    const second = service.getSourceMetadataFile(magnet, 'b'.repeat(40));
    await jest.advanceTimersByTimeAsync(1);
    expect(remote.torrentFile).toHaveBeenCalledTimes(1);
    release();
    await jest.advanceTimersByTimeAsync(1);
    await Promise.all([first, duplicate, second]);
    expect(remote.torrentFile).toHaveBeenCalledTimes(2);
  });

  it('keeps the peer metadata lane available when background resolution is disabled', async () => {
    const { service, remote, download } = setupTest(false);
    expect(service.isEnabled()).toBe(false);
    expect(await service.getSourceMetadataFile(magnet, hash)).toBeNull();
    expect(await service.getPlaybackTorrentMetadataFile(magnet, hash)).toEqual(
      Buffer.from('metadata')
    );
    expect(download.getSourceMetadataFile).toHaveBeenCalledWith(magnet, hash, 15_000);
    expect(remote.torrentFile).not.toHaveBeenCalled();
  });

  it('looks up two playback torrents side by side; a third waits for a free slot', async () => {
    const { service, download } = setupTest(false);
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    download.getSourceMetadataFile.mockImplementation(async () => {
      await gate;
      return Buffer.from('metadata');
    });

    const first = service.getPlaybackTorrentMetadataFile(magnet, 'a'.repeat(40));
    const second = service.getPlaybackTorrentMetadataFile(magnet, 'b'.repeat(40));
    const third = service.getPlaybackTorrentMetadataFile(magnet, 'c'.repeat(40));
    await Promise.resolve();
    expect(download.getSourceMetadataFile).toHaveBeenCalledTimes(2);
    release();
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      Buffer.from('metadata'),
      Buffer.from('metadata'),
      Buffer.from('metadata'),
    ]);
    expect(download.getSourceMetadataFile).toHaveBeenCalledTimes(3);
  });
});
