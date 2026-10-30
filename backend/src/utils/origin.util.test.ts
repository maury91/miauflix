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
  it('accepts only file:// while the TV app is allowed', () => {
    const settings = { allowTvApp: true };
    expect(isTvAppOrigin('file://', settings)).toBe(true);
    expect(isTvAppOrigin('null', settings)).toBe(false);
    expect(isTvAppOrigin(undefined, settings)).toBe(false);
    expect(isTvAppOrigin('https://miauflix.example', settings)).toBe(false);
    expect(isTvAppOrigin('file://host', settings)).toBe(false);
  });

  it('accepts null only with its own opt-in', () => {
    expect(isTvAppOrigin('null', { allowTvApp: true, allowNullOrigin: true })).toBe(true);
    expect(isTvAppOrigin('file://', { allowTvApp: true, allowNullOrigin: true })).toBe(true);
  });

  it('accepts nothing while the TV app is not allowed', () => {
    expect(isTvAppOrigin('file://', { allowTvApp: false, allowNullOrigin: true })).toBe(false);
    expect(isTvAppOrigin('null', { allowNullOrigin: true })).toBe(false);
  });
});
