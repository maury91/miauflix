import {
  claimStartPriority,
  TORRENT_PRIORITY,
  torrentDownloadCap,
  torrentPriority,
} from './torrent-priority';

describe('torrent priority', () => {
  it('starts torrents by how soon someone will watch them', () => {
    expect(claimStartPriority('playback')).toBe(TORRENT_PRIORITY.playback);
    expect(claimStartPriority('warmup')).toBe(TORRENT_PRIORITY.warmup);
    expect(claimStartPriority('prefetch')).toBe(TORRENT_PRIORITY.background);
    expect(claimStartPriority('watched')).toBe(TORRENT_PRIORITY.background);
    expect(claimStartPriority('watchlist')).toBe(TORRENT_PRIORITY.idle);
  });

  it('puts an open stream above every claim and otherwise takes the strongest claim', () => {
    expect(torrentPriority({ streams: 1, claimKinds: ['watchlist'] })).toBe(
      TORRENT_PRIORITY.streaming
    );
    expect(torrentPriority({ streams: 0, claimKinds: ['watchlist', 'warmup', 'prefetch'] })).toBe(
      TORRENT_PRIORITY.warmup
    );
    expect(torrentPriority({ streams: 0, claimKinds: [] })).toBe(TORRENT_PRIORITY.idle);
  });

  it('caps torrents nobody watches only while a stream buffers under a global limit', () => {
    const downloadLimit = 1_000_000;
    expect(torrentDownloadCap({ streams: 0, streamBuffering: true, downloadLimit })).toBe(250_000);
    expect(torrentDownloadCap({ streams: 1, streamBuffering: true, downloadLimit })).toBe(-1);
    expect(torrentDownloadCap({ streams: 0, streamBuffering: false, downloadLimit })).toBe(-1);
    expect(torrentDownloadCap({ streams: 0, streamBuffering: true, downloadLimit: 0 })).toBe(-1);
    expect(torrentDownloadCap({ streams: 0, streamBuffering: true, downloadLimit: 2 })).toBe(1);
  });
});
