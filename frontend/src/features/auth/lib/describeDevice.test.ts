import { describe, expect, it } from 'vitest';

import { describeDevice } from './describeDevice';

describe('describeDevice', () => {
  it.each([
    [
      'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106/5.5 TV Safari/537.36',
      { kind: 'tv', name: 'Samsung TV' },
    ],
    [
      'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0 Safari/537.36',
      { kind: 'tv', name: 'LG TV' },
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      { kind: 'phone', name: 'Safari on iPhone' },
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      { kind: 'computer', name: 'Chrome on macOS' },
    ],
    [null, { kind: 'unknown', name: 'A new device' }],
  ])('%s', (userAgent: string | null, expected: object) => {
    expect(describeDevice(userAgent)).toEqual(expected);
  });
});
