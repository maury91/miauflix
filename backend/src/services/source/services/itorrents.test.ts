import { getTorrentFromITorrents } from './itorrents';

describe('iTorrents service', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1748088913000);
  });
  it('should fetch a torrent from iTorrents', async () => {
    const hash = 'c9e15763f722f23e98a29decdfae341b98d53056'; // Cosmos Laundromat
    const torrent = await getTorrentFromITorrents(hash, 100);
    expect(torrent.ok).toBeTruthy();
    expect(torrent.headers.get('content-type')).toBe('application/x-bittorrent');
  });

  it('should return null for a missing hash', async () => {
    const missingHash = 'c9e15763f722f23e98a29decdfae341b98d53057';
    const torrent = await getTorrentFromITorrents(missingHash, 100);
    expect(torrent.ok).toBeTruthy();
    expect(torrent.headers.get('content-type')).not.toBe('application/x-bittorrent');
  });
});
