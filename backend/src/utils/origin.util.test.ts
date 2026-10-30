import { isAllowedOrigin, isTvAppOrigin } from './origin.util';

describe('isAllowedOrigin', () => {
  it('treats a sole wildcard as unrestricted but keeps mixed lists restricted', () => {
    expect(isAllowedOrigin('https://anything.example', ['*'])).toBe(true);
    expect(isAllowedOrigin('https://anything.example', ['https://app.example', '*'])).toBe(false);
    expect(isAllowedOrigin('https://app.example', ['https://app.example', '*'])).toBe(true);
  });

  it('requires HTTPS and the default port for scheme-less wildcard domains', () => {
    expect(isAllowedOrigin('https://app.example.com', ['*.example.com'])).toBe(true);
    expect(isAllowedOrigin('http://app.example.com', ['*.example.com'])).toBe(false);
    expect(isAllowedOrigin('https://app.example.com:8443', ['*.example.com'])).toBe(false);
  });

  it('honors an explicit wildcard scheme and port', () => {
    expect(isAllowedOrigin('http://app.example.com:8080', ['http://*.example.com:8080'])).toBe(
      true
    );
    expect(isAllowedOrigin('https://app.example.com:8080', ['http://*.example.com:8080'])).toBe(
      false
    );
  });
});

describe('isTvAppOrigin', () => {
  it('matches only the local-file origins the TV app sends', () => {
    expect(isTvAppOrigin('file://')).toBe(true);
    expect(isTvAppOrigin('null')).toBe(true);
    expect(isTvAppOrigin(undefined)).toBe(false);
    expect(isTvAppOrigin('https://miauflix.example')).toBe(false);
    expect(isTvAppOrigin('file://host')).toBe(false);
  });
});
