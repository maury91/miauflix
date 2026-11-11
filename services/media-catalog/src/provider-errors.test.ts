import { describe, expect, it } from 'bun:test';

import { ProviderError } from './provider/provider';
import { mapProviderError } from './service';

describe('mapProviderError', () => {
  it('reports a rejected TMDB token as a configuration problem', () => {
    const mapped = mapProviderError(new ProviderError('TMDB API error: (401) Unauthorized', 401));
    expect(mapped?.code).toBe('not_configured');
    expect(mapped?.message).toContain('TMDB rejected the API access token');
  });

  it('keeps timeouts and other TMDB failures readable', () => {
    expect(
      mapProviderError(new ProviderError('TMDB API request timed out after 10000ms'))?.code
    ).toBe('timeout');
    const other = mapProviderError(new ProviderError('TMDB API error: (502) Bad Gateway', 502));
    expect(other).toMatchObject({ code: 'internal', message: 'TMDB API error: (502) Bad Gateway' });
  });

  it('leaves other errors alone', () => {
    expect(mapProviderError(new Error('boom'))).toBeUndefined();
  });
});
