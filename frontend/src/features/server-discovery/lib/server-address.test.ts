import { describe, expect, it } from 'vitest';

import { displayServerAddress, normalizeServerAddress } from './server-address';

describe('normalizeServerAddress', () => {
  it('adds the scheme, and the default port to a bare IP', () => {
    expect(normalizeServerAddress(' 192.168.1.10 ')).toBe('http://192.168.1.10:3000');
    expect(normalizeServerAddress('192.168.1.10:8080')).toBe('http://192.168.1.10:8080');
    expect(normalizeServerAddress('miauflix.lan')).toBe('http://miauflix.lan');
  });

  it('keeps a port the user typed, even the scheme default', () => {
    expect(normalizeServerAddress('192.168.1.10:80')).toBe('http://192.168.1.10');
  });

  it('keeps https and drops paths', () => {
    expect(normalizeServerAddress('https://miauflix.example.com/home')).toBe(
      'https://miauflix.example.com'
    );
  });

  it('rejects what cannot be an address', () => {
    expect(normalizeServerAddress('')).toBeNull();
    expect(normalizeServerAddress('ftp://x.example')).toBeNull();
    expect(normalizeServerAddress('http://')).toBeNull();
  });
});

describe('displayServerAddress', () => {
  it('drops the scheme', () => {
    expect(displayServerAddress('http://192.168.1.10:3000')).toBe('192.168.1.10:3000');
  });
});
