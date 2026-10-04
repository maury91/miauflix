import { resolve } from 'node:path';

import type { Page, Route } from '@playwright/test';

import { expect, test } from './fixtures';

const fixtureMovie = {
  _type: 'movie' as const,
  id: 83533,
  mediaId: 83533,
  title: 'Embers of the Distant World',
  overview:
    'After a devastating loss, the bereaved couple face a hostile local people faction whose leader threatens the fragile peace of their world.',
  tagline: '',
  poster: '/test-assets/poster.jpg',
  backdrop: '/test-assets/backdrop.jpg',
  backdropFocus: null,
  logo: '/test-assets/logo.png',
  genres: ['Science Fiction', 'Adventure', 'Fantasy'],
  popularity: 42,
  rating: 7.6,
  releaseDate: '2025-12-17',
  runtime: 198,
};

const source = {
  id: 501,
  quality: 'FHD' as const,
  sourceType: 'WEB' as const,
};

type Preparation = {
  playable: { kind: 'movie'; mediaId: number };
  state: 'checking' | 'source_found' | 'error' | 'no_source';
  source: typeof source | null;
  warmup: {
    state: 'not_requested' | 'warming' | 'ready' | 'paused' | 'failed';
    progress?: number;
  };
};

type Harness = {
  preloadRequests: Array<{ view: string; sequence: number; focused: unknown }>;
  cleanupSequences: number[];
  detailsHeartbeats: number;
  torrentEvents: string[];
};

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function detailsResponse() {
  return {
    type: 'movie',
    ...fixtureMovie,
    imdbId: 'tt0499549',
    sources: [
      {
        id: source.id,
        quality: source.quality,
        size: 1_000_000,
        videoCodec: 'H264',
        broadcasters: 12,
        watchers: 4,
        source: source.sourceType,
        hasDataFile: true,
      },
    ],
  };
}

async function installOfflineHarness(page: Page): Promise<Harness> {
  const harness: Harness = {
    preloadRequests: [],
    cleanupSequences: [],
    detailsHeartbeats: 0,
    torrentEvents: [],
  };

  await page.route('**/test-assets/*', route => {
    const asset = route.request().url().endsWith('logo.png')
      ? resolve(process.cwd(), '../test-fixtures/providers/tmdb/images/tmdb-83533-logo.png')
      : resolve(process.cwd(), '../test-fixtures/providers/tmdb/images/tmdb-83533-backdrop.jpg');
    return route.fulfill({ path: asset });
  });

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (!path.startsWith('/api/')) return route.continue();

    if (path === '/api/auth/sessions' && request.method() === 'GET') {
      return json(route, []);
    }
    if (path === '/api/auth/setup' && request.method() === 'GET') {
      return json(route, { available: false });
    }
    if (path === '/api/auth/login' && request.method() === 'POST') {
      return json(route, {
        session: 'offline-e2e-session',
        user: {
          id: 'offline-user',
          email: 'test@example.com',
          displayName: 'Test User',
          role: 'admin',
        },
      });
    }
    if (path === '/api/auth/qr' && request.method() === 'POST') {
      return json(route, {
        requestId: 'offline-qr-request',
        claimToken: 'offline-qr-claim',
        approvalPath: '/auth/qr/offline-qr-request',
        pollInterval: 30,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    if (path === '/api/auth/qr/offline-qr-request/claim' && request.method() === 'POST') {
      return json(route, { status: 'pending' });
    }
    if (path === '/api/config' && request.method() === 'GET') return json(route, []);
    if (path === '/api/status' && request.method() === 'GET') return json(route, { services: {} });
    if (path === '/api/integrations/trakt/association' && request.method() === 'GET') {
      return json(route, {
        connected: true,
        provider: 'trakt',
        accountId: 'fixture-account',
        username: 'fixture-user',
      });
    }
    if (path === '/api/lists' && request.method() === 'GET') {
      return json(route, [
        {
          name: 'Fixture Movies',
          slug: 'fixture-movies',
          description: '',
          url: '/list/fixture-movies',
        },
      ]);
    }
    if (path === '/api/lists/popular' && request.method() === 'GET') {
      return json(route, { results: [], page: 0, pageSize: 20, total: 0, totalPages: 0 });
    }
    if (path === '/api/list/fixture-movies' && request.method() === 'GET') {
      return json(route, {
        results: [fixtureMovie],
        total: 1,
        page: 0,
        pageSize: 20,
        totalPages: 1,
      });
    }
    if (path === '/api/list/priorities' && request.method() === 'POST')
      return json(route, { accepted: 1 });
    if (path === '/api/progress' && request.method() === 'GET')
      return json(route, { progress: [] });
    if (path === '/api/media/movie/83533/backdrop-focus' && request.method() === 'POST') {
      return json(route, { backdropFocus: null });
    }
    if (path === '/api/movies/83533' && request.method() === 'GET')
      return json(route, detailsResponse());

    if (path.startsWith('/api/preload/intents/') && request.method() === 'PUT') {
      const intent = request.postDataJSON() as { sequence: number; view: string; focused: unknown };
      harness.preloadRequests.push(intent);
      if (intent.view === 'details') {
        harness.detailsHeartbeats += 1;
        harness.torrentEvents.push(
          harness.detailsHeartbeats === 1 ? 'warmup:start' : 'warmup:ready'
        );
      }
      const preparation: Preparation = {
        playable: { kind: 'movie', mediaId: 83533 },
        state: intent.view === 'browse' ? 'source_found' : 'source_found',
        source,
        warmup:
          intent.view === 'details'
            ? {
                state: harness.detailsHeartbeats > 1 ? 'ready' : 'warming',
                progress: harness.detailsHeartbeats > 1 ? 100 : 50,
              }
            : { state: 'not_requested' },
      };
      return json(route, {
        acceptedSequence: intent.sequence,
        expiresAt: new Date(Date.now() + 15_000).toISOString(),
        preparation,
      });
    }
    if (path.startsWith('/api/preload/intents/') && request.method() === 'DELETE') {
      const sequence = Number(url.searchParams.get('sequence'));
      harness.cleanupSequences.push(sequence);
      harness.torrentEvents.push('warmup:paused');
      return route.fulfill({ status: 204, body: '' });
    }

    // A playback request is intentionally mocked as well: this test stops at
    // the details page and must never construct or contact a real torrent.
    if (path === '/api/playback/sessions' && request.method() === 'POST') {
      harness.torrentEvents.push('playback:mocked');
      return json(route, {
        playbackId: 'offline-playback',
        streamingKey: 'offline-streaming-key',
        streamUrl: '/api/stream/offline-streaming-key',
        source: {
          id: source.id,
          quality: source.quality,
          size: 1_000_000,
          videoCodec: 'H264',
          broadcasters: 0,
          watchers: 0,
        },
        preparation: { state: 'warm', verifiedBytes: 64, allocatedBytes: 64 },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    }

    throw new Error(`Unexpected offline E2E request: ${request.method()} ${path}`);
  });

  return harness;
}

async function login(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window._miauflixAnimationComplete === true);
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('testpassword123');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('main')).toBeVisible();
}

test.describe('details page preparation contract', () => {
  test('mocks source search and torrent warmup through ready, with a visual screenshot', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'The details visual baseline is desktop-only'
    );
    const harness = await installOfflineHarness(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page);

    const card = page.getByRole('button', { name: fixtureMovie.title, exact: true });
    await expect(card).toBeVisible();
    await card.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('main', { name: `${fixtureMovie.title} details` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Watch now' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to browse' })).toBeVisible();
    await expect(page.getByLabel(/1080p, WEB source/)).toBeVisible();
    const warmupBorder = page.locator('[data-warmup-state]');
    await expect(warmupBorder).toHaveAttribute('data-warmup-state', 'warming');
    await expect(warmupBorder).toHaveAttribute('data-warmup-progress', '50');
    await expect(page.getByText('Initial buffer ready')).not.toBeVisible();

    await expect
      .poll(() => harness.torrentEvents.includes('warmup:ready'), { timeout: 12_000 })
      .toBe(true);
    await expect(warmupBorder).toHaveAttribute('data-warmup-state', 'ready');
    await expect(warmupBorder).toHaveAttribute('data-warmup-progress', '100');
    await expect(page.getByText('Initial buffer ready')).not.toBeVisible();
    await expect(page.getByLabel(/1080p, WEB source/)).toBeVisible();

    const screenshot = await page.screenshot({ animations: 'disabled', fullPage: true });
    await testInfo.attach('details-page-source-ready.png', {
      body: screenshot,
      contentType: 'image/png',
    });
    await expect(page).toHaveScreenshot('details-page-source-ready.png', {
      animations: 'disabled',
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Back to browse' }).click();
    await expect(page.getByRole('button', { name: fixtureMovie.title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Optional settings' })).toBeVisible();
    await expect.poll(() => harness.cleanupSequences.length, { timeout: 5_000 }).toBeGreaterThan(0);
    await expect.poll(() => harness.torrentEvents.includes('warmup:paused')).toBe(true);
    expect(harness.preloadRequests.some(request => request.view === 'details')).toBe(true);
    await page.close();
  });
});
