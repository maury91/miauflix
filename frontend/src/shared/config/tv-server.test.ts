import { afterEach, describe, expect, it } from 'vitest';

import { packagedTvServer } from './tv-server';

describe('packagedTvServer', () => {
  afterEach(() => {
    delete window.API_URL;
  });

  it('prefers the server written into index.html after the build', () => {
    window.API_URL = 'https://watch.example.com/';
    expect(packagedTvServer('https://built.example.com')).toBe('https://watch.example.com');
  });

  it('falls back to the build-time server when index.html has none', () => {
    window.API_URL = '/';
    expect(packagedTvServer('https://built.example.com')).toBe('https://built.example.com');
  });

  it('is empty when the package has no server', () => {
    window.API_URL = '/';
    expect(packagedTvServer('/')).toBe('');
    window.API_URL = '';
    expect(packagedTvServer('')).toBe('');
  });
});
