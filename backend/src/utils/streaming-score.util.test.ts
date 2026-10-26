import { Quality, VideoCodec } from '@miauflix/source-metadata-extractor';

import { calculateStreamingScore, type StreamingScoreInput } from './streaming-score.util';

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
    // FHD 2500 + X264 1800, unknown age x0.9; SD only has 500 quality points.
    expect(fhd).toBe(Math.round((2500 + 1800) * 0.9));
    expect(sd).toBe(Math.round((500 + 1800) * 0.9));
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
      calculateStreamingScore(source({ quality: '3D', videoCodec: VideoCodec.X264 }), NOW)
    ).toBe(Math.round(1800 * 0.9));
    expect(calculateStreamingScore(source({}), NOW)).toBe(Math.round(2000 * 0.9));
  });
});
