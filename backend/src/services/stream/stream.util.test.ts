import { createMockContentSource } from '@__test-utils__/mocks/movie.mock';
import { configureFakerSeed } from '@__test-utils__/utils';
import { Quality, VideoCodec } from '@miauflix/source-metadata-extractor';

import {
  estimatedBitrateKbps,
  filterHevcSources,
  filterSources,
  filterStreamableSources,
  preferWithinBitrate,
} from './stream.util';

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

    it('should default allowHevc to true', () => {
      const sources = [streamableH264Source, streamableHevcSource];
      const result = filterSources(sources);
      expect(result).toEqual([streamableHevcSource, streamableH264Source]);
    });
  });

  describe('bitrate cap', () => {
    const HOUR = 3600;
    const sized = (id: number, size: number) => createMockContentSource({ id, size });

    it('estimates the average bitrate from size and runtime', () => {
      // 4.5 GB over an hour is 10 Mbit/s
      expect(estimatedBitrateKbps(sized(1, 4.5e9), HOUR)).toBe(10_000);
      expect(estimatedBitrateKbps(sized(1, 0), HOUR)).toBeNull();
      expect(estimatedBitrateKbps(sized(1, 4.5e9), 0)).toBeNull();
    });

    it('keeps sources within the cap in order, then the rest from the leanest', () => {
      const fitsA = sized(1, 3e9);
      const overHeavy = sized(2, 20e9);
      const fitsB = sized(3, 1e9);
      const overLight = sized(4, 9e9);
      // Cap at 8 Mbit/s over an hour: 3.6 GB
      expect(
        preferWithinBitrate([fitsA, overHeavy, fitsB, overLight], 8_000, HOUR).map(s => s.id)
      ).toEqual([1, 3, 4, 2]);
    });

    it('treats a source of unknown size as fitting', () => {
      const unknown = sized(1, 0);
      const over = sized(2, 20e9);
      expect(preferWithinBitrate([over, unknown], 8_000, HOUR)).toEqual([unknown, over]);
    });

    it('measures the bytes a source plays, like one episode of a season pack', () => {
      const pack = sized(1, 40e9);
      const single = sized(2, 6e9);
      const episodeFile = new Map([
        [1, 1.5e9],
        [2, 6e9],
      ]);
      const sizeOf = (source: { id: number }) => episodeFile.get(source.id) ?? null;
      expect(estimatedBitrateKbps(pack, HOUR, sizeOf)).toBeCloseTo(3_333.3, 1);
      expect(preferWithinBitrate([single, pack], 8_000, HOUR, sizeOf).map(s => s.id)).toEqual([
        1, 2,
      ]);
      expect(preferWithinBitrate([pack, single], 8_000, HOUR, () => null)).toEqual([pack, single]);
    });
  });
});
