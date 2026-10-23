import { fixtureMovie, installOfflineHarness, login } from './utils/details-harness';
import { expect, test } from './fixtures';

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
      // Allow the Linux fallback-star glyph to shift the adjacent quality badge.
      maxDiffPixels: 700,
    });

    await page.getByRole('button', { name: 'Back to browse' }).click();
    await expect(page.getByRole('button', { name: fixtureMovie.title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expect.poll(() => harness.cleanupSequences.length, { timeout: 5_000 }).toBeGreaterThan(0);
    await expect.poll(() => harness.torrentEvents.includes('warmup:paused')).toBe(true);
    expect(harness.preloadRequests.some(request => request.view === 'details')).toBe(true);
    await page.close();
  });
});
