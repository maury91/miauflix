import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const STORYBOOK_BASE_URL = 'http://localhost:6006/iframe.html';
const HOME_VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
] as const;

const storyUrl = (id: string) => `${STORYBOOK_BASE_URL}?id=${id}&viewMode=story`;

/** Fonts and every poster loaded, so the screenshot never catches a half-drawn panel. */
async function waitForArtwork(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll<HTMLImageElement>('button img')];
    return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0);
  });
}

test.describe('Notifications stories - visual regression', () => {
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
      document.head.appendChild(style);
    });
  });

  for (const [story, name] of [
    ['unread-visual', 'unread'],
    ['with-read-shown', 'with-read'],
    ['all-caught-up', 'all-caught-up'],
  ] as const) {
    test(`captures the ${name} notifications panel`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.mouse.move(1279, 899);
      await page.goto(storyUrl(`home-notifications-menu--${story}`));
      const panel = page.getByRole('region', { name: 'Notifications' });
      // The first story a worker opens waits for Storybook's cold start.
      await expect(panel).toBeVisible({ timeout: 30_000 });
      if (story !== 'all-caught-up') await waitForArtwork(page);
      else await page.evaluate(() => document.fonts.ready);

      await expect(panel).toHaveScreenshot(`notifications-panel-${name}.png`, {
        animations: 'disabled',
      });
    });
  }

  for (const viewport of HOME_VIEWPORTS) {
    test(`captures the panel beside the rail on Home at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      // Park the pointer over the hero: away from the rail and the panel, and off the rows,
      // whose hover takes over navigation (bottom right is a row's "next" arrow at 1920px).
      await page.mouse.move(viewport.width - 1, 1);
      await page.goto(storyUrl('home-home-page--notifications-visual'));
      await waitForArtwork(page);

      // From the selected card, Left opens the rail on Search and Up highlights the bell. Home
      // may still be settling focus after the artwork loads, so retry until Left lands.
      const search = page.getByRole('button', { name: 'Search' });
      await expect(async () => {
        await page.locator('[aria-current="true"]').first().focus();
        await page.keyboard.press('ArrowLeft');
        await expect(search).toBeFocused({ timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      await page.keyboard.press('ArrowUp');
      const bell = page.getByRole('button', { name: /^Notifications, \d+ unread$/ });
      await expect(bell).toBeFocused();
      const panel = page.getByRole('region', { name: 'Notifications' });
      await expect(panel).toBeVisible();
      await waitForArtwork(page);
      await expect(page).toHaveScreenshot(`home-notifications-highlighted-${viewport.name}.png`, {
        animations: 'disabled',
      });

      // Right moves the keyboard onto the newest notification; the rail stays expanded.
      await page.keyboard.press('ArrowRight');
      await expect(panel.getByRole('button', { name: /^New episode available/ })).toBeFocused();
      await expect(page).toHaveScreenshot(`home-notifications-focused-${viewport.name}.png`, {
        animations: 'disabled',
      });

      // Down past the unread notifications reaches "Show read notifications".
      const showRead = panel.getByRole('button', { name: 'Show read notifications' });
      for (let step = 0; step < 10; step++) {
        if (await showRead.evaluate(element => element === document.activeElement)) break;
        await page.keyboard.press('ArrowDown');
      }
      await expect(showRead).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(panel.getByRole('button', { name: 'Hide read notifications' })).toBeVisible();
      await waitForArtwork(page);
      await expect(page).toHaveScreenshot(`home-notifications-read-shown-${viewport.name}.png`, {
        animations: 'disabled',
      });
    });
  }
});
