import { navigateToLogin } from './utils/login';
import { expect, test } from './fixtures';

const adminEmail = process.env['E2E_ADMIN_EMAIL'] ?? 'test@example.com';
const adminPassword = process.env['E2E_ADMIN_PASSWORD'] ?? 'testpassword123';
const crossLoadEnabled = process.env['E2E_HOME_CROSS_LOAD'] === 'true';

const fixedHomeLists = [
  'trakt-movies-popular',
  'trakt-movies-trending',
  'trakt-shows-popular',
  'trakt-shows-trending',
] as const;

type ListResponseBody = {
  results?: Array<{
    _type?: string;
    mediaId?: number;
    poster?: string;
    backdrop?: string;
  }>;
  total?: number;
};

type PopularListsResponseBody = {
  results?: Array<{ name?: string; slug?: string }>;
};

async function login(page: import('@playwright/test').Page): Promise<void> {
  await navigateToLogin(page);
  await page.locator('#email').fill(adminEmail);
  await page.locator('#password').fill(adminPassword);
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/api/auth/login')),
    page.locator('button[type="submit"]').click(),
  ]);
  await expect(page.getByRole('main')).toBeVisible();
}

function captureApiResponses(page: import('@playwright/test').Page) {
  const listBodies = new Map<string, ListResponseBody>();
  const popularListsBodies: PopularListsResponseBody[] = [];

  page.on('response', response => {
    const url = new URL(response.url());
    if (response.request().method() !== 'GET' || response.status() !== 200) return;

    if (url.pathname === '/api/lists/popular') {
      void response
        .json()
        .then(body => popularListsBodies.push(body as PopularListsResponseBody))
        .catch(() => undefined);
      return;
    }

    const match = /^\/api\/list\/([^/]+)$/.exec(url.pathname);
    if (!match) return;
    void response
      .json()
      .then(body => listBodies.set(decodeURIComponent(match[1]), body as ListResponseBody))
      .catch(() => undefined);
  });

  return { listBodies, popularListsBodies };
}

async function waitForListBody(
  listBodies: Map<string, ListResponseBody>,
  slug: string
): Promise<ListResponseBody> {
  await expect
    .poll(() => listBodies.get(slug), {
      timeout: 60000,
      message: `Expected list response for ${slug}`,
    })
    .toBeTruthy();
  return listBodies.get(slug)!;
}

function assertHydrated(body: ListResponseBody, slug: string): void {
  const results = body.results ?? [];
  expect(results.length, `${slug} returned no hydrated media`).toBeGreaterThan(0);
  expect(results.every(media => typeof media.mediaId === 'number')).toBe(true);
  expect(results.every(media => media.poster || media.backdrop)).toBe(true);
}

test.describe('Home catalog cross-loading', () => {
  test.skip(
    !crossLoadEnabled,
    'Opt-in lane: set E2E_HOME_CROSS_LOAD=true for provider recording/replay verification'
  );
  test.describe.configure({ timeout: 120000 });

  test('cross-loads TMDB details for the first four home lists', async ({ page }) => {
    const { listBodies } = captureApiResponses(page);
    await login(page);
    await page.getByRole('main').focus();

    for (const [index, slug] of fixedHomeLists.entries()) {
      if (index > 0) await page.keyboard.press('ArrowDown');
      const body = await waitForListBody(listBodies, slug);
      assertHydrated(body, slug);
    }
  });

  test('keeps the Marvel list identities unique', async ({ page }) => {
    const { listBodies, popularListsBodies } = captureApiResponses(page);
    await login(page);

    await expect
      .poll(() => popularListsBodies.flatMap(body => body.results ?? []), { timeout: 60000 })
      .not.toHaveLength(0);
    const topMarvel = popularListsBodies
      .flatMap(body => body.results ?? [])
      .find(list => /marvel/i.test(list.name ?? ''));
    expect(topMarvel?.slug).toBeTruthy();

    const topMarvelRow = page.locator('section').filter({
      has: page.getByRole('heading', { name: topMarvel!.name!, exact: true }),
    });
    await page.getByRole('main').focus();
    // The fixed rows occupy the first four positions; a bounded walk reaches
    // the first popular row without causing the infinite popular-list query
    // to fetch another provider page.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ((await topMarvelRow.locator('[aria-current="true"]').count()) > 0) break;
      await page.keyboard.press('ArrowDown');
    }

    const body = await waitForListBody(listBodies, topMarvel!.slug!);
    assertHydrated(body, topMarvel!.slug!);
    const identities = (body.results ?? []).map(media => `${media._type}:${media.mediaId}`);
    expect(new Set(identities).size, 'Top Marvel contains duplicate media identities').toBe(
      identities.length
    );
  });
});
