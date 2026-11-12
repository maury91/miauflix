import { redactUrlAttributes } from './redact-url-attributes';

describe('redactUrlAttributes', () => {
  it('masks tokens in URL, path and query attributes', () => {
    expect(
      redactUrlAttributes({
        'url.full': 'https://m.example/api/stream/tok?streamingKey=k&start=1',
        'http.target': '/api/%73tream/tok/prefetch',
        'url.path': '/api/auth/qr/approval',
        'url.query': 'streamingKey=k&start=1',
        'http.route': '/api/stream/:token',
      })
    ).toEqual({
      'url.full': 'https://m.example/api/stream/REDACTED?streamingKey=REDACTED&start=1',
      'http.target': '/api/stream/REDACTED/prefetch',
      'url.path': '/api/auth/qr/REDACTED',
      'url.query': 'streamingKey=REDACTED&start=1',
    });
  });

  it('masks the query of a path attribute', () => {
    expect(
      redactUrlAttributes({ 'http.target': '/api/stream/tok?streamingKey=k&start=1' })
    ).toEqual({
      'http.target': '/api/stream/REDACTED?streamingKey=REDACTED&start=1',
    });
  });

  it('leaves spans without URL attributes alone', () => {
    expect(redactUrlAttributes({ 'http.route': '/api/movies/:id' })).toEqual({});
  });
});
