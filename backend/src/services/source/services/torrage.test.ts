import { getTorrentFromTorrage } from './torrage';

describe('Torrage service', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1748088913000);
  });
  it('should fetch a torrent from Torrage', async () => {
    const hash = 'c9e15763f722f23e98a29decdfae341b98d53056'; // Cosmos Laundromat
    const torrent = await getTorrentFromTorrage(hash, 100);
    expect(torrent.ok).toBeTruthy();
    expect(torrent.headers.get('content-type')).toBe('application/x-bittorrent');
    const text = await torrent.text();
    expect(text).toContain('d8:announce');
  });

  it('should return null for a missing hash', async () => {
    const missingHash = 'c9e15763f722f23e98a29decdfae341b98d53057';
    const torrent = await getTorrentFromTorrage(missingHash, 100);
    expect(torrent.ok).toBeFalsy();
    expect(torrent.status).toBe(404);
  });
});
