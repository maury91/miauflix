import type { MediaDto } from '@miauflix/backend';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const preloader = vi.hoisted(() => ({
  loaded: new Set<string>(),
  idle: new Map<string, (size: { width: number; height: number }) => void>(),
}));

vi.mock('@shared/config/constants', async importOriginal => ({
  ...(await importOriginal<typeof import('@shared/config/constants')>()),
  builtForTizen: true,
}));
vi.mock('@shared/config/tv-profile', () => ({
  getTvHeroBackdropSizes: () => ({ moving: 'w780', resting: 'w1280' }),
}));
vi.mock('@features/media/api/media.api', () => ({
  useEnsureBackdropFocusMutation: () => [
    () => ({ unwrap: () => Promise.resolve({ backdropFocus: null }) }),
  ],
}));
vi.mock('react-redux', () => ({ useSelector: () => undefined }));
vi.mock('../hooks/useMediaBoxSizes', () => ({ useMediaBoxSizes: () => ({ margin: 50 }) }));
vi.mock('../image-preloader', () => ({
  URGENT: 0,
  imagePreloader: {
    load: (url: string) => {
      preloader.loaded.add(url);
      return Promise.resolve({ width: 1280, height: 720 });
    },
    loadWhenIdle: (_owner: string, url: string) =>
      new Promise(resolve => preloader.idle.set(url, resolve)),
    isLoaded: (url: string) => preloader.loaded.has(url),
    clear: vi.fn(),
  },
}));

import { MediaHero } from './MediaHero';

const movie = (mediaId: number, backdrop: string) =>
  ({
    _type: 'movie',
    mediaId,
    title: `Movie ${mediaId}`,
    backdrop,
    backdropFocus: null,
    genres: [],
  }) as unknown as MediaDto;

const backdrops = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('div'))
    .map(element => element.style.backgroundImage)
    .filter(Boolean);

describe('MediaHero on the Samsung TV', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    preloader.loaded.clear();
    preloader.idle.clear();
  });

  it('swaps in the resting backdrop once it loads while idle', async () => {
    const { container } = render(<MediaHero media={movie(1, '/one.jpg')} />);
    await waitFor(() => expect(backdrops(container)).toEqual([expect.stringContaining('/w780/')]));
    await waitFor(() => expect(preloader.idle.size).toBe(1));
    const [restingUrl, finish] = [...preloader.idle][0]!;
    expect(restingUrl).toContain('/w1280/one.jpg');

    preloader.loaded.add(restingUrl);
    finish({ width: 1920, height: 1080 });

    await waitFor(() => expect(backdrops(container).at(-1)).toContain('/w1280/one.jpg'));
  });

  it('shows a resting backdrop that already loaded at once', async () => {
    preloader.loaded.add('https://image.tmdb.org/t/p/w1280/two.jpg');
    const { container } = render(<MediaHero media={movie(2, '/two.jpg')} />);

    await waitFor(() =>
      expect(backdrops(container)).toEqual([expect.stringContaining('/w1280/two.jpg')])
    );
    expect(preloader.idle.size).toBe(0);
  });

  it('drops the resting backdrop of a title the selection left', async () => {
    const { container, rerender } = render(<MediaHero media={movie(3, '/three.jpg')} />);
    await waitFor(() => expect(preloader.idle.size).toBe(1));
    const [, finish] = [...preloader.idle][0]!;

    rerender(<MediaHero media={movie(4, '/four.jpg')} />);
    await waitFor(() => expect(backdrops(container).at(-1)).toContain('/w780/four.jpg'));
    finish({ width: 1920, height: 1080 });
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(backdrops(container).some(url => url.includes('/w1280/three.jpg'))).toBe(false);
  });
});
