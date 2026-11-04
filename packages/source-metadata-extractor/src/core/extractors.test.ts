import { extractValue } from './extractors';

import { VideoCodec } from '@/types';

describe('video codec bit depth', () => {
  test.each([
    ['x265 10bit', VideoCodec.X265_10BIT],
    ['x265 10-BIT', VideoCodec.X265_10BIT],
    ['x265 bit 10', VideoCodec.X265],
    ['x265 10\nbit', VideoCodec.X265],
    ['x265 10\rbit', VideoCodec.X265],
    ['x265 10\u2028bit', VideoCodec.X265],
    ['x265 10\u2029bit', VideoCodec.X265],
    [`x265 ${'10'.repeat(100_000)}`, VideoCodec.X265],
    [`x265 ${'10'.repeat(100_000)}bit`, VideoCodec.X265_10BIT],
  ])('extracts bit depth (case %#)', (title, expected) => {
    const workingText = {
      title,
      description: '',
      titleSegments: [{ start: 0, end: title.length }],
      descriptionSegments: [],
    };
    expect(
      extractValue(
        workingText,
        [{ regex: /[\s\S]+/g, value: VideoCodec.X265, specificity: 1 }],
        { found: false, specificity: 0, count: 0 },
        true
      )
    ).toEqual([expected]);
  });
});
