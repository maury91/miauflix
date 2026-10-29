import { createMockContentSource } from '@__test-utils__/mocks/movie.mock';
import { configureFakerSeed } from '@__test-utils__/utils';
import { Quality, VideoCodec } from '@miauflix/source-metadata-extractor';

import { filterHevcSources, filterSources, filterStreamableSources } from './stream.util';

describe('stream.util', () => {
  beforeAll(() => {
    configureFakerSeed();
  });

  describe('filterStreamableSources', () => {
    const sourceWithFile1 = createMockContentSource({ file: Buffer.from('mock file 1 ') });
    const sourceWithFile2 = createMockContentSource({ file: Buffer.from('mock file 2 ') });
    const sourceWithFile3 = createMockContentSource({ file: Buffer.from('mock file 3 ') });
    const sourceWithoutFile1 = createMockContentSource({ file: undefined });
    const sourceWithoutFile2 = createMockContentSource({ file: undefined });

    it.each([
      [[sourceWithFile1, sourceWithoutFile1], [sourceWithFile1]],
      [[sourceWithoutFile1, sourceWithoutFile2], []],
      [
        [sourceWithFile1, sourceWithFile2],
        [sourceWithFile1, sourceWithFile2],
      ],
      [
        [sourceWithFile1, sourceWithoutFile1, sourceWithFile2, sourceWithoutFile2, sourceWithFile3],
        [sourceWithFile1, sourceWithFile2, sourceWithFile3],
      ],
      [[], []],
    ])('should return only streamable sources', (sources, expected) => {
      const result = filterStreamableSources(sources);
      expect(result).toEqual(expected);
    });
  });

  describe('filterHevcSources', () => {
    const h264Source = createMockContentSource({
      videoCodec: VideoCodec.X264,
    });
    const hevcSource = createMockContentSource({
      videoCodec: VideoCodec.X265,
    });
    const hevc10BitSource = createMockContentSource({
      videoCodec: VideoCodec.X265_10BIT,
    });
    const av1Source = createMockContentSource({
      videoCodec: VideoCodec.AV1,
    });
    const undefinedSource = createMockContentSource({
      videoCodec: undefined,
    });

    it.each([
      [
        [h264Source, hevcSource, hevc10BitSource, av1Source],
        [h264Source, av1Source],
      ],
      [
        [h264Source, undefinedSource, av1Source],
        [h264Source, undefinedSource, av1Source],
      ],
      [[hevcSource, hevc10BitSource], []],
      [[hevcSource, hevc10BitSource, undefinedSource], [undefinedSource]],
      [[undefinedSource], [undefinedSource]],
      [[], []],
    ])('should return only non-hevc sources', (sources, expected) => {
      const result = filterHevcSources(sources, false);
      expect(result).toEqual(expected);
    });

    it.each([
      [
        [h264Source, hevcSource, hevc10BitSource, av1Source],
        [h264Source, hevcSource, hevc10BitSource, av1Source],
      ],
      [
        [h264Source, hevcSource, hevc10BitSource, undefinedSource],
        [h264Source, hevcSource, hevc10BitSource, undefinedSource],
      ],
      [[], []],
    ])('should return all sources when allowHevc is true', (sources, expected) => {
      const result = filterHevcSources(sources, true);
      expect(result).toEqual(expected);
    });
  });

  describe('filterSources', () => {
    const streamableH264Source = createMockContentSource({
      file: Buffer.from('h264 file'),
      videoCodec: VideoCodec.X264,
      quality: Quality.FHD,
      streamingScore: 85,
    });
    const streamableHevcSource = createMockContentSource({
      file: Buffer.from('hevc file'),
      videoCodec: VideoCodec.X265,
      quality: Quality['4K'],
      streamingScore: 95,
    });
    const nonStreamableH264Source = createMockContentSource({
      file: undefined,
      videoCodec: VideoCodec.X264,
      quality: Quality.HD,
      streamingScore: 75,
    });
    const nonStreamableHevcSource = createMockContentSource({
      file: undefined,
      videoCodec: VideoCodec.X265,
      quality: Quality['2K'],
      streamingScore: 90,
    });

    it.each([
      [
        [
          streamableH264Source,
          nonStreamableH264Source,
          streamableHevcSource,
          nonStreamableHevcSource,
        ],
        [streamableHevcSource, streamableH264Source],
      ],
      [[nonStreamableH264Source, nonStreamableHevcSource], []],
      [[], []],
    ])('should filter streamable sources, and sort by streaming score', (sources, expected) => {
      const result = filterSources(sources, true);
      expect(result).toEqual(expected);
    });

    it('ranks a recently played source above an equal one, and an old play below a better one', () => {
      jest.useFakeTimers({ now: new Date('2026-10-29T12:00:00Z') });
      try {
        const unproven = createMockContentSource({
          file: Buffer.from('a'),
          streamingScore: 3_000,
          lastPlayedOn: null,
        });
        const proven = createMockContentSource({
          file: Buffer.from('b'),
          streamingScore: 3_000,
          lastPlayedOn: '2026-10-28',
        });
        const better = createMockContentSource({
          file: Buffer.from('c'),
          streamingScore: 3_100,
          lastPlayedOn: null,
        });
        const playedLongAgo = createMockContentSource({
          file: Buffer.from('d'),
          streamingScore: 3_000,
          lastPlayedOn: '2026-04-01',
        });

        expect(filterSources([unproven, proven])).toEqual([proven, unproven]);
        expect(filterSources([playedLongAgo, better])).toEqual([better, playedLongAgo]);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should default allowHevc to true', () => {
      const sources = [streamableH264Source, streamableHevcSource];
      const result = filterSources(sources);
      expect(result).toEqual([streamableHevcSource, streamableH264Source]);
    });
  });
});
