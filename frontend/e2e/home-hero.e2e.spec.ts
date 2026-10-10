import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

import { dismissTraktPrompt, navigateToLogin, waitForTraktAssociation } from './utils/login';
import { expect, test } from './fixtures';

const adminEmail = process.env['E2E_ADMIN_EMAIL'] ?? 'test@example.com';
const adminPassword = process.env['E2E_ADMIN_PASSWORD'] ?? 'testpassword123';

type MediaListResponse = {
  results?: Array<{
    mediaId?: number;
    title?: string;
    name?: string;
    backdrop?: string;
  }>;
};

type HeroCase = {
  listSlug: 'trakt-movies-popular' | 'trakt-movies-trending';
  rowName: 'Popular Movies' | 'Trending Movies';
  mediaId: number;
};

// These fixtures cover the layouts the centering algorithm must handle: landscapes without a
// detected face, a small distant subject, close-up faces, a two-person group, a large ensemble,
// and a single face. All are served by the E2E catalog/image mocks.
const heroCases: HeroCase[] = [
  { listSlug: 'trakt-movies-popular', rowName: 'Popular Movies', mediaId: 1368166 },
  { listSlug: 'trakt-movies-popular', rowName: 'Popular Movies', mediaId: 1275779 },
  { listSlug: 'trakt-movies-popular', rowName: 'Popular Movies', mediaId: 969681 },
  { listSlug: 'trakt-movies-trending', rowName: 'Trending Movies', mediaId: 1101383 },
  { listSlug: 'trakt-movies-trending', rowName: 'Trending Movies', mediaId: 1423191 },
  { listSlug: 'trakt-movies-trending', rowName: 'Trending Movies', mediaId: 1204680 },
  { listSlug: 'trakt-movies-trending', rowName: 'Trending Movies', mediaId: 1607127 },
  { listSlug: 'trakt-movies-trending', rowName: 'Trending Movies', mediaId: 299534 },
];

function captureListResponses(page: Page): Map<string, MediaListResponse> {
  const listBodies = new Map<string, MediaListResponse>();
  page.on('response', response => {
    const url = new URL(response.url());
    if (response.request().method() !== 'GET' || response.status() !== 200) return;
    const match = /^\/api\/list\/([^/]+)$/.exec(url.pathname);
    if (!match) return;
    void response
      .json()
      .then(body => listBodies.set(decodeURIComponent(match[1]), body as MediaListResponse))
      .catch(() => undefined);
  });
  return listBodies;
}

async function login(page: Page): Promise<void> {
  await navigateToLogin(page);
  await page.locator('#email').fill(adminEmail);
  await page.locator('#password').fill(adminPassword);
  const associationResponse = waitForTraktAssociation(page);
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/api/auth/login')),
    page.locator('button[type="submit"]').click(),
  ]);
  await expect(page.getByRole('main')).toBeVisible();
  await dismissTraktPrompt(page, associationResponse);
}

async function waitForListBody(
  listBodies: Map<string, MediaListResponse>,
  slug: string
): Promise<MediaListResponse> {
  await expect
    .poll(() => listBodies.get(slug), {
      timeout: 60000,
      message: `Expected list response for ${slug}`,
    })
    .toBeTruthy();
  return listBodies.get(slug)!;
}

function mediaTitle(media: { title?: string; name?: string }): string {
  return media.title ?? media.name ?? '';
}

function imagePath(path: string): string {
  const pathname = path.startsWith('http') ? new URL(path).pathname : path;
  return pathname.replace('/w500/', '/original/');
}

async function focusHeroCase(
  page: Page,
  heroCase: HeroCase,
  listBodies: Map<string, MediaListResponse>
): Promise<void> {
  const results = listBodies.get(heroCase.listSlug)?.results ?? [];
  const targetIndex = results.findIndex(candidate => candidate.mediaId === heroCase.mediaId);
  const media = results.find(candidate => candidate.mediaId === heroCase.mediaId);
  expect(targetIndex, `E2E list is missing TMDB ${heroCase.mediaId}`).toBeGreaterThanOrEqual(0);
  expect(media, `E2E list is missing TMDB ${heroCase.mediaId}`).toBeTruthy();
  expect(media?.backdrop, `TMDB ${heroCase.mediaId} has no backdrop`).toBeTruthy();

  const row = page.locator('section').filter({
    has: page.getByRole('heading', { name: heroCase.rowName, exact: true }),
  });
  const card = row.getByRole('button', { name: mediaTitle(media!), exact: true });
  await expect(card).toBeVisible();
  await card.hover();
  await expect(card).toHaveAttribute('aria-current', 'true');

  const hero = page.locator('header[aria-live="polite"]');
  const expectedImagePath = imagePath(media!.backdrop!);
  await expect(hero).toBeVisible();
  await expect
    .poll(
      async () => {
        const layers = await hero.locator('[aria-hidden="true"]').evaluateAll(elements =>
          elements.map(element => {
            const style = getComputedStyle(element);
            return {
              opacity: style.opacity,
              backgroundImage: style.backgroundImage,
            };
          })
        );
        return layers.some(
          layer => layer.opacity === '1' && layer.backgroundImage.includes(expectedImagePath)
        );
      },
      {
        timeout: 60000,
        message: `Hero did not settle on the centered TMDB ${heroCase.mediaId} backdrop`,
      }
    )
    .toBe(true);

  // Logos load independently from the preloaded backdrop; wait for their decoded pixels too.
  await hero
    .locator('img')
    .evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
  await expect(hero).toHaveScreenshot(`home-hero-${heroCase.mediaId}.png`, {
    animations: 'disabled',
    // Hide overlapping rows and normalize asynchronous source status only during capture.
    stylePath: fileURLToPath(new URL('./home-hero.screenshot.css', import.meta.url)),
  });
}

test.describe('Home hero backdrop centering', () => {
  test.describe.configure({ mode: 'serial', timeout: 180000 });

  test('keeps representative E2E backdrops visible in the hero', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Hero screenshots use the desktop layout'
    );

    const listBodies = captureListResponses(page);
    await login(page);
    await waitForListBody(listBodies, 'trakt-movies-popular');
    await waitForListBody(listBodies, 'trakt-movies-trending');

    for (const heroCase of heroCases) {
      await focusHeroCase(page, heroCase, listBodies);
    }
  });
});
