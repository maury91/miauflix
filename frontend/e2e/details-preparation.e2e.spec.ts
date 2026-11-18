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
    const watch = page.getByRole('button', { name: 'Watch now' });
    await expect(watch).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to browse' })).toBeVisible();
    await expect(page.getByLabel(/1080p, WEB source/)).toBeVisible();
    const warmupProgress = page.locator('[data-warmup-state="warming"]');
    await expect(warmupProgress).toBeVisible();
    await expect(watch).toHaveAccessibleDescription('Warming up torrent, 50% ready');

    await expect
      .poll(() => harness.torrentEvents.includes('warmup:ready'), { timeout: 12_000 })
      .toBe(true);
    await expect(watch).toHaveAccessibleDescription('Torrent warmup ready');
    await expect(warmupProgress).toBeHidden();
    await expect(page.getByLabel(/1080p, WEB source/)).toBeVisible();

    const screenshot = await page.screenshot({ animations: 'disabled', fullPage: true });
    await testInfo.attach('details-page-source-ready.png', {
      body: screenshot,
      contentType: 'image/png',
    });
    await expect(page).toHaveScreenshot('details-page-source-ready.png', {
      animations: 'disabled',
      fullPage: true,
      // Allow small font rendering differences between Linux environments.
      maxDiffPixels: 700,
    });

    await page.getByRole('button', { name: 'Back to browse' }).click();
    await expect(page.getByRole('button', { name: fixtureMovie.title, exact: true })).toBeVisible();
    // Leave Home for another page (Settings is a panel on Home now, so Search)
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/\/search$/);
    await expect.poll(() => harness.cleanupSequences.length, { timeout: 5_000 }).toBeGreaterThan(0);
    await expect.poll(() => harness.torrentEvents.includes('warmup:paused')).toBe(true);
    expect(harness.preloadRequests.some(request => request.view === 'details')).toBe(true);
    await page.close();
  });
});
