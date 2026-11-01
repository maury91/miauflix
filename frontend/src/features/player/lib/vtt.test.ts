import { describe, expect, it } from 'vitest';

import { parseVtt } from './vtt';

describe('parseVtt', () => {
  it('reads cue timings and text', () => {
    const source = [
      'WEBVTT',
      '',
      'NOTE a comment',
      '',
      '1',
      '00:00:01.500 --> 00:00:03.000 line:75%',
      '<i>Hello</i> &amp; welcome',
      'second line',
      '',
      '01:02:03.004 --> 01:02:05.000',
      'Later',
    ].join('\r\n');
    expect(parseVtt(source)).toEqual([
      { start: 1.5, end: 3, text: 'Hello & welcome\nsecond line' },
      { start: 3723.004, end: 3725, text: 'Later' },
    ]);
  });

  it('accepts minutes-only timestamps and skips empty cues', () => {
    expect(parseVtt('WEBVTT\n\n00:10.000 --> 00:12.000\n\n00:13.000 --> 00:14.000\nHi')).toEqual([
      { start: 13, end: 14, text: 'Hi' },
    ]);
  });
});
