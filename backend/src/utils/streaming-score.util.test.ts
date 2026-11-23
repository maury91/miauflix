import { Quality, VideoCodec } from '@miauwatch/source-metadata-extractor';

import {
  byPlaybackRank,
  calculateStreamingScore,
  playbackRank,
  provenPlayBoost,
  type StreamingScoreInput,
} from './streaming-score.util';

const NOW = new Date('2026-10-25T12:00:00Z').getTime();

const source = (overrides: Partial<StreamingScoreInput>): StreamingScoreInput => ({
  broadcasters: 0,
  watchers: 0,
  quality: null,
  videoCodec: null,
  sourceUploadedAt: undefined as unknown as Date,
  ...overrides,
});

describe('calculateStreamingScore', () => {
  it('scores enum values, not database indexes', () => {
    const fhd = calculateStreamingScore(
      source({ quality: Quality.FHD, videoCodec: VideoCodec.X264 }),
      NOW
    );
    const sd = calculateStreamingScore(
      source({ quality: Quality.SD, videoCodec: VideoCodec.X264 }),
      NOW
    );
    // FHD 2500 + X264 1800, unknown age x0.9; SD only has 500 quality points. Neither is
    // seeded, so both are divided by 100.
    expect(fhd).toBe(Math.round(((2500 + 1800) * 0.9) / 100));
    expect(sd).toBe(Math.round(((500 + 1800) * 0.9) / 100));
  });

  it('ranks any seeded source above an unseeded one, whatever its quality', () => {
    // A real movie's sources: playback started on the unseeded 1080p copy and never got going.
    const unseeded = calculateStreamingScore(
      source({ quality: Quality.FHD, videoCodec: VideoCodec.X265, watchers: 14 }),
      NOW
    );
    const fourSeeds = calculateStreamingScore(
      source({
        quality: Quality.FHD,
        videoCodec: VideoCodec.X265,
        broadcasters: 4,
        watchers: 1,
        sourceUploadedAt: new Date(NOW - 5 * 365 * 24 * 60 * 60 * 1000),
      }),
      NOW
    );
    const worstSeeded = calculateStreamingScore(
      source({
        quality: '3D',
        videoCodec: VideoCodec.VC1,
        broadcasters: 1,
        watchers: 1000,
        sourceUploadedAt: new Date(NOW - 5 * 365 * 24 * 60 * 60 * 1000),
      }),
      NOW
    );
    const bestUnseeded = calculateStreamingScore(
      source({
        quality: Quality['8K'],
        videoCodec: VideoCodec.AV1,
        watchers: 10_000,
        sourceUploadedAt: new Date(NOW),
      }),
      NOW
    );
    expect(fourSeeds).toBeGreaterThan(unseeded);
    expect(worstSeeded).toBeGreaterThan(bestUnseeded);
    expect(bestUnseeded).toBe(60);
    // Unseeded sources keep their order among themselves.
    expect(unseeded).toBeGreaterThan(
      calculateStreamingScore(source({ quality: Quality.SD, videoCodec: VideoCodec.X265 }), NOW)
    );
  });

  it('ranks a well-seeded 1080p release above a weakly seeded 4K one', () => {
    // The real sources of one movie: the 4K copy has 77 seeds, the 1080p one 737.
    const weak4k = calculateStreamingScore(
      source({
        quality: Quality['4K'],
        videoCodec: VideoCodec.X265,
        broadcasters: 77,
        watchers: 148,
      }),
      NOW
    );
    const seeded1080p = calculateStreamingScore(
      source({
        quality: Quality.FHD,
        videoCodec: VideoCodec.X265_10BIT,
        broadcasters: 737,
        watchers: 242,
      }),
      NOW
    );
    expect(seeded1080p).toBeGreaterThan(weak4k);
  });

  it('caps every component, so the maximum is 10,000', () => {
    const best = calculateStreamingScore(
      source({
        quality: Quality['8K'],
        videoCodec: VideoCodec.AV1_10BIT,
        broadcasters: 10_000,
        watchers: 1,
        sourceUploadedAt: new Date(NOW - 24 * 60 * 60 * 1000),
      }),
      NOW
    );
    expect(best).toBe(10_000);
  });

  it('scales older uploads down', () => {
    const base = { quality: Quality.FHD, videoCodec: VideoCodec.X264, broadcasters: 50 };
    const year = 365 * 24 * 60 * 60 * 1000;
    const recent = calculateStreamingScore(
      source({ ...base, sourceUploadedAt: new Date(NOW - year / 2) }),
      NOW
    );
    const older = calculateStreamingScore(
      source({ ...base, sourceUploadedAt: new Date(NOW - 1.5 * year) }),
      NOW
    );
    const old = calculateStreamingScore(
      source({ ...base, sourceUploadedAt: new Date(NOW - 3 * year) }),
      NOW
    );
    expect(older).toBe(Math.round(recent * 0.85));
    expect(old).toBe(Math.round(recent * 0.7));
  });

  it('gives no points for 3D and middle points for unknown quality or codec', () => {
    expect(
      calculateStreamingScore(
        source({ quality: '3D', videoCodec: VideoCodec.X264, broadcasters: 1 }),
        NOW
      )
    ).toBe(Math.round((40 + 1800 + 10) * 0.9));
    expect(calculateStreamingScore(source({ broadcasters: 1 }), NOW)).toBe(
      Math.round((40 + 2000 + 10) * 0.9)
    );
  });
});

describe('provenPlayBoost', () => {
  const daysAgo = (days: number) =>
    new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  it('gives nothing to a source never seen playing, or an unreadable day', () => {
    expect(provenPlayBoost(null, NOW)).toBe(0);
    expect(provenPlayBoost(undefined, NOW)).toBe(0);
    expect(provenPlayBoost('not a day', NOW)).toBe(0);
  });

  it('halves every 30 days, so an old play counts for little', () => {
    const today = provenPlayBoost(daysAgo(0), NOW);
    expect(today).toBeGreaterThan(280);
    expect(today).toBeLessThanOrEqual(300);
    expect(provenPlayBoost(daysAgo(30), NOW)).toBeCloseTo(today / 2, -1);
    expect(provenPlayBoost(daysAgo(60), NOW)).toBeCloseTo(today / 4, -1);
    expect(provenPlayBoost(daysAgo(180), NOW)).toBeLessThan(10);
  });

  it('breaks a tie between equal scores in favour of the proven source', () => {
    const unproven = { streamingScore: 4_000, broadcasters: 1, lastPlayedOn: null };
    const proven = { streamingScore: 4_000, broadcasters: 1, lastPlayedOn: daysAgo(2) };
    expect([unproven, proven].sort(byPlaybackRank(NOW))).toEqual([proven, unproven]);
  });

  it('never lifts a source over a whole quality step', () => {
    const hd = calculateStreamingScore(source({ quality: Quality.HD, broadcasters: 1 }), NOW);
    const fhd = calculateStreamingScore(source({ quality: Quality.FHD, broadcasters: 1 }), NOW);
    expect(
      playbackRank({ streamingScore: hd, broadcasters: 1, lastPlayedOn: daysAgo(0) }, NOW)
    ).toBeLessThan(playbackRank({ streamingScore: fhd, broadcasters: 1, lastPlayedOn: null }, NOW));
  });

  it('never lifts a source over the smallest quality step, even for the oldest uploads', () => {
    const oldUpload = new Date(NOW - 3 * 365 * 24 * 60 * 60 * 1000);
    const fhd = calculateStreamingScore(
      source({ quality: Quality.FHD, broadcasters: 1, sourceUploadedAt: oldUpload }),
      NOW
    );
    const twoK = calculateStreamingScore(
      source({ quality: Quality['2K'], broadcasters: 1, sourceUploadedAt: oldUpload }),
      NOW
    );
    expect(twoK - fhd).toBe(350);
    expect(
      playbackRank({ streamingScore: fhd, broadcasters: 1, lastPlayedOn: daysAgo(0) }, NOW)
    ).toBeLessThan(
      playbackRank({ streamingScore: twoK, broadcasters: 1, lastPlayedOn: null }, NOW)
    );
  });

  it('keeps an unseeded source below every seeded one, even when it played well today', () => {
    const unseeded = calculateStreamingScore(
      source({ quality: Quality['4K'], broadcasters: 0 }),
      NOW
    );
    const weakest = calculateStreamingScore(
      source({ quality: Quality.SD, broadcasters: 1, sourceUploadedAt: new Date(0) }),
      NOW
    );
    expect(
      playbackRank({ streamingScore: unseeded, broadcasters: 0, lastPlayedOn: daysAgo(0) }, NOW)
    ).toBeLessThan(
      playbackRank({ streamingScore: weakest, broadcasters: 1, lastPlayedOn: null }, NOW)
    );
  });

  it('beats a modestly larger tracker seeder claim when recent, but not once it decays', () => {
    const claimed = calculateStreamingScore(
      source({ broadcasters: 15, quality: Quality.FHD }),
      NOW
    );
    const seen = calculateStreamingScore(source({ broadcasters: 10, quality: Quality.FHD }), NOW);
    expect(
      playbackRank({ streamingScore: seen, broadcasters: 1, lastPlayedOn: daysAgo(1) }, NOW)
    ).toBeGreaterThan(
      playbackRank({ streamingScore: claimed, broadcasters: 1, lastPlayedOn: null }, NOW)
    );
    expect(
      playbackRank({ streamingScore: seen, broadcasters: 1, lastPlayedOn: daysAgo(120) }, NOW)
    ).toBeLessThan(
      playbackRank({ streamingScore: claimed, broadcasters: 1, lastPlayedOn: null }, NOW)
    );
  });
});
