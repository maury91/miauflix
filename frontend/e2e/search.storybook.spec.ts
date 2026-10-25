import { expect, test } from './fixtures';

const STORYBOOK_BASE_URL = 'http://localhost:6006/iframe.html';

test.describe('Search stories - visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          scroll-behavior: auto !important;
        }
      `;
      // Init scripts can run before <head> exists.
      (document.head ?? document.documentElement).appendChild(style);
    });
  });

  test('captures the SearchPage results story at 1440x900', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Keep the pointer outside the hover rail when the story mounts.
    await page.mouse.move(1439, 450);
    await page.goto(`${STORYBOOK_BASE_URL}?id=search-search-page--results&viewMode=story`);

    // The first story load waits for Storybook to compile, which is slow in a cold container.
    await expect(page.getByRole('heading', { name: 'Results for “Dune”' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'A', exact: true })).toBeFocused();
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll<HTMLImageElement>('button img')].filter(
        image => image.getBoundingClientRect().left < window.innerWidth
      );
      return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0);
    });

    await expect(page).toHaveScreenshot('search-page-results-1440x900.png', {
      fullPage: false,
      animations: 'disabled',
    });
  });
});
