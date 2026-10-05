import { resolve } from 'node:path';

import type { Page, Route } from '@playwright/test';

import { expect, test } from './fixtures';

const movie = {
  _type: 'movie' as const,
  id: 83533,
  mediaId: 83533,
  title: 'Embers of the Distant World',
  overview: 'A fixture movie used to exercise the details-page voting controls.',
  tagline: '',
  poster: '/test-assets/poster.jpg',
  backdrop: '/test-assets/backdrop.jpg',
  backdropFocus: null,
  logo: '/test-assets/logo.png',
  genres: ['Science Fiction', 'Adventure'],
  popularity: 42,
  rating: 7.6,
  releaseDate: '2025-12-17',
  runtime: 198,
};

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installVotingHarness(page: Page): Promise<void> {
  await page.route('**/test-assets/*', route => {
    const asset = route.request().url().endsWith('logo.png')
      ? resolve(process.cwd(), '../test-fixtures/providers/tmdb/images/tmdb-83533-logo.png')
      : resolve(process.cwd(), '../test-fixtures/providers/tmdb/images/tmdb-83533-backdrop.jpg');
    return route.fulfill({ path: asset });
  });

  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/auth/sessions' && request.method() === 'GET') return json(route, []);
    if (path === '/api/auth/setup' && request.method() === 'GET')
      return json(route, { available: false });
    if (path === '/api/auth/login' && request.method() === 'POST')
      return json(route, {
        session: 'offline-voting-session',
        user: {
          id: 'offline-voting-user',
          email: 'voting@example.com',
          displayName: 'Voting User',
          role: 'admin',
        },
      });
    if (path === '/api/auth/qr' && request.method() === 'POST')
      return json(route, {
        requestId: 'offline-voting-qr',
        claimToken: 'offline-voting-claim',
        approvalPath: '/auth/qr/offline-voting-qr',
        pollInterval: 30,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    if (path === '/api/auth/qr/offline-voting-qr/claim' && request.method() === 'POST')
      return json(route, { status: 'pending' });
    if (path === '/api/config' && request.method() === 'GET') return json(route, []);
    if (path === '/api/status' && request.method() === 'GET') return json(route, { services: {} });
    if (path === '/api/integrations/trakt/association' && request.method() === 'GET')
      return json(route, {
        connected: true,
        provider: 'trakt',
        accountId: 'fixture-account',
        username: 'fixture-user',
      });
    if (path === '/api/lists' && request.method() === 'GET')
      return json(route, [
        {
          name: 'Fixture Movies',
          slug: 'fixture-movies',
          description: '',
          url: '/list/fixture-movies',
        },
      ]);
    if (path === '/api/lists/popular' && request.method() === 'GET')
      return json(route, { results: [], page: 0, pageSize: 20, total: 0, totalPages: 0 });
    if (path === '/api/list/fixture-movies' && request.method() === 'GET')
      return json(route, { results: [movie], total: 1, page: 0, pageSize: 20, totalPages: 1 });
    if (path === '/api/list/priorities' && request.method() === 'POST')
      return json(route, { accepted: 1 });
    if (path === '/api/progress' && request.method() === 'GET')
      return json(route, { progress: [] });
    if (path === '/api/media/movie/83533/backdrop-focus' && request.method() === 'POST')
      return json(route, { backdropFocus: null });
    if (path === '/api/movies/83533' && request.method() === 'GET')
      return json(route, {
        type: 'movie',
        ...movie,
        imdbId: 'tt0499549',
        sources: [],
      });
    if (path.startsWith('/api/preload/intents/') && request.method() === 'PUT')
      return json(route, {
        acceptedSequence: Number(request.postDataJSON()?.sequence ?? 1),
        expiresAt: new Date(Date.now() + 15_000).toISOString(),
        preparation: {
          playable: { kind: 'movie', mediaId: movie.mediaId },
          state: 'source_found',
          source: null,
          warmup: { state: 'not_requested' },
        },
      });
    if (path.startsWith('/api/preload/intents/') && request.method() === 'DELETE')
      return route.fulfill({ status: 204, body: '' });
    throw new Error(`Unexpected voting E2E request: ${request.method()} ${path}`);
  });
}

async function login(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window._miauflixAnimationComplete === true);
  await page.getByLabel('Email').fill('voting@example.com');
  await page.getByLabel('Password').fill('testpassword123');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('main')).toBeVisible();
}

test.describe('details page voting controls', () => {
  test('selects, changes, clears, and visually captures each vote', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Visual baseline is desktop-only');
    await installVotingHarness(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page);

    const card = page.getByRole('button', { name: movie.title, exact: true });
    await card.focus();
    await page.keyboard.press('Enter');

    const details = page.getByRole('main', { name: `${movie.title} details` });
    await expect(details).toBeVisible();
    const dislike = page.getByRole('button', { name: "Don't like it", exact: true });
    const like = page.getByRole('button', { name: 'Like it', exact: true });
    const love = page.getByRole('button', { name: 'Love it', exact: true });
    await expect(dislike).toBeVisible();
    await expect(like).toBeVisible();
    await expect(love).toBeVisible();
    await expect(dislike).toHaveAttribute('aria-pressed', 'false');

    await dislike.click();
    await expect(dislike).toHaveAttribute('aria-pressed', 'true');
    await expect(like).toHaveAttribute('aria-pressed', 'false');
    await expect(love).toHaveAttribute('aria-pressed', 'false');
    await expect(dislike).toHaveScreenshot('details-vote-dislike.png');

    await like.click();
    await expect(dislike).toHaveAttribute('aria-pressed', 'false');
    await expect(like).toHaveAttribute('aria-pressed', 'true');
    await expect(like).toHaveScreenshot('details-vote-like.png');

    await love.click();
    await expect(like).toHaveAttribute('aria-pressed', 'false');
    await expect(love).toHaveAttribute('aria-pressed', 'true');
    await expect(love).toHaveScreenshot('details-vote-love.png');

    await love.click();
    await expect(love).toHaveAttribute('aria-pressed', 'false');
    await expect(details).toHaveScreenshot('details-vote-cleared.png', {
      animations: 'disabled',
      // Ubuntu runners and the Jammy image use different fallback fonts for ★,
      // slightly shifting the adjacent rating and source-status text.
      maxDiffPixels: 700,
    });
  });

  test('keeps voting separate from playback activation', async ({ page }) => {
    await installVotingHarness(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page);
    await page.getByRole('button', { name: movie.title, exact: true }).press('Enter');

    await page.getByRole('button', { name: 'Like it', exact: true }).click();
    await expect(page.getByRole('main', { name: `${movie.title} details` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Like it', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByRole('button', { name: 'Watch Now', exact: true })).toBeVisible();
  });

  test('keeps the voting group usable on a narrow details layout', async ({ page }) => {
    await installVotingHarness(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page);
    await page.getByRole('button', { name: movie.title, exact: true }).press('Enter');

    const details = page.getByRole('main', { name: `${movie.title} details` });
    await expect(details).toBeVisible();
    await expect(page.getByRole('button', { name: 'Love it', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Love it', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Love it', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(details).toHaveScreenshot('details-vote-mobile.png', { animations: 'disabled' });
  });
});
