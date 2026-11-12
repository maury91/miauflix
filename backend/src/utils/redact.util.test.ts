import { redactHeaders, redactPath, redactQuery, redactUrl } from './redact.util';

describe('redact', () => {
  it('masks the token segment of stream and QR paths', () => {
    expect(redactPath('/api/stream/abc.def')).toBe('/api/stream/REDACTED');
    expect(redactPath('/api/stream/abc/prefetch')).toBe('/api/stream/REDACTED/prefetch');
    expect(redactPath('/api/auth/qr/approval-token/approve')).toBe('/api/auth/qr/REDACTED/approve');
    expect(redactPath('/api/movies/42')).toBe('/api/movies/42');
  });

  it('masks tokens behind a percent-encoded prefix, as the router decodes it', () => {
    expect(redactPath('/api/%73tream/abc.def')).toBe('/api/stream/REDACTED');
    expect(redactPath('/api/%73tream/abc/%E0%A4%A')).toBe('/api/stream/REDACTED/%E0%A4%A');
    expect(redactPath('/api/movies/%2042')).toBe('/api/movies/%2042');
  });

  it("masks the web app's QR approval page in a referrer", () => {
    expect(redactPath('/auth/qr/approval-token')).toBe('/auth/qr/REDACTED');
    expect(redactUrl('https://m.example/auth/qr/approval-token')).toBe(
      'https://m.example/auth/qr/REDACTED'
    );
  });

  it('masks secret query values and keeps the rest', () => {
    expect(redactQuery(new URLSearchParams('streamingKey=secret&start=10&format=vtt'))).toEqual({
      streamingKey: 'REDACTED',
      start: '10',
      format: 'vtt',
    });
  });

  it('masks secrets inside a URL', () => {
    expect(redactUrl('https://m.example/api/stream/tok?streamingKey=k&x=1#frag')).toBe(
      'https://m.example/api/stream/REDACTED?streamingKey=REDACTED&x=1'
    );
    expect(redactUrl('not a url')).toBe('REDACTED');
  });

  it('keeps only known-safe headers', () => {
    const headers = new Headers({
      'User-Agent': 'TV',
      'X-Refresh-Token': 'secret-refresh',
      'X-Refresh-Tokens': 's1:secret',
      Authorization: 'Bearer secret',
      Cookie: '__rt_s1=secret',
      'X-Reverse-Proxy-Secret': 'secret',
      'X-Session-Id': 's1',
      Referer: 'https://m.example/api/stream/tok',
    });
    expect(redactHeaders(headers)).toEqual({
      'user-agent': 'TV',
      'x-session-id': 's1',
      referer: 'https://m.example/api/stream/REDACTED',
    });
  });
});
