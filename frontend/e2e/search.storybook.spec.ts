import type { Page } from '@playwright/test';

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

  /** Wait for the story's fonts and the artwork of the tiles in view. */
  const settle = async (page: Page) => {
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll<HTMLImageElement>('button img')].filter(
        image => image.getBoundingClientRect().left < window.innerWidth
      );
      return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0);
    });
  };

  test('captures the SearchPage desktop results story at 1440x900', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Keep the pointer outside the hover rail when the story mounts.
    await page.mouse.move(1439, 450);
    await page.goto(`${STORYBOOK_BASE_URL}?id=search-search-page--desktop-results&viewMode=story`);

    // The first story load waits for Storybook to compile, which is slow in a cold container.
    await expect(page.getByRole('heading', { name: 'Results for “Dune”' })).toBeVisible({
      timeout: 30_000,
    });
    // Off TV there is no on-screen keyboard and the field starts ready to type
    await expect(page.getByRole('searchbox', { name: 'Search' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'a', exact: true })).toHaveCount(0);
    await settle(page);

    await expect(page).toHaveScreenshot('search-page-results-1440x900.png', {
      fullPage: false,
      animations: 'disabled',
    });
  });

  test.describe('TV mode', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      // Keep the pointer outside the hover rail when the story mounts.
      await page.mouse.move(1919, 540);
      // The TV story (on-screen keyboard, read-only field) at the TV density (24px base)
      await page.goto(
        `${STORYBOOK_BASE_URL}?id=search-search-page--results&viewMode=story&globals=density:tv`
      );
      await expect(page.getByRole('heading', { name: 'Results for “Dune”' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole('button', { name: 'a', exact: true })).toBeFocused();
      await settle(page);
    });

    test('captures the keyboard, shortcuts and results at 1920x1080', async ({ page }) => {
      // The field only shows the text: no submit arrow
      await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeVisible();

      await expect(page).toHaveScreenshot('search-page-tv-keyboard-1920x1080.png', {
        fullPage: false,
        animations: 'disabled',
      });
    });

    test('captures a focused result in the mosaic at 1920x1080', async ({ page }) => {
      // Right along the keyboard's top row, then past its edge into the results
      for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowDown');
      const results = page.getByRole('region', { name: 'Results for “Dune”' });
      await expect(results.locator(':focus')).toHaveCount(1);
      await settle(page);

      await expect(page).toHaveScreenshot('search-page-tv-result-focused-1920x1080.png', {
        fullPage: false,
        animations: 'disabled',
      });
    });

    test('captures a focused popular search at 1920x1080', async ({ page }) => {
      // Down past the keyboard's rows into the genres, one per line
      for (let step = 0; step < 7; step++) await page.keyboard.press('ArrowDown');
      const popular = page.getByRole('region', { name: 'Popular searches' });
      await expect(popular.locator(':focus')).toHaveCount(1);

      await expect(page).toHaveScreenshot('search-page-tv-popular-focused-1920x1080.png', {
        fullPage: false,
        animations: 'disabled',
      });
    });
  });
});
