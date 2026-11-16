import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const STORYBOOK_BASE_URL = 'http://localhost:6006/iframe.html';
const HOME_VIEWPORTS = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
] as const;

async function waitForHomeArtwork(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll<HTMLImageElement>('button img')];
    return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0);
  });
}

test.describe('Home stories - visual regression', () => {
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

  test('captures the loaded CategoryRow story', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${STORYBOOK_BASE_URL}?id=home-category-row--loaded-visual&viewMode=story`);
    await waitForHomeArtwork(page);

    await expect(page.getByRole('region', { name: 'Popular Movies' })).toHaveScreenshot(
      'category-row-loaded.png',
      {
        animations: 'disabled',
      }
    );
  });

  test('captures fixed CategoryRow arrow positions at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(
      `${STORYBOOK_BASE_URL}?id=home-category-row--arrow-sequence-visual&viewMode=story`
    );
    await waitForHomeArtwork(page);

    const row = page.getByRole('region', { name: 'Popular Movies' });
    // The carousel moves its track with a transform; read where it rests
    const track = row.locator('ul').first();
    const offset = () =>
      track.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41);
    const next = page.getByRole('button', { name: 'Next Popular Movies items' });
    const previous = page.getByRole('button', { name: 'Previous Popular Movies items' });
    const offsets: number[] = [];
    const screenshot = async (position: number, name: string) => {
      let last = Number.NaN;
      await expect
        .poll(async () => {
          const now = await offset();
          const settled = now === last;
          last = now;
          return settled;
        })
        .toBe(true);
      // Each page moves the track one step further; going back returns to the same place
      offsets[position] ??= last;
      expect(last).toBe(offsets[position]);
      if (position > 0) expect(last).toBeLessThan(offsets[position - 1]!);
      await expect(page.locator('[aria-current="true"]')).toHaveCount(1);
      await expect(row).toHaveScreenshot(`category-row-arrow-${name}.png`, {
        animations: 'disabled',
      });
    };

    await screenshot(0, 'initial');
    for (const position of [1, 2, 3]) {
      await next.click();
      await screenshot(position, `right-${position}`);
    }
    for (const [movement, position] of [2, 1, 0].entries()) {
      await previous.click();
      await screenshot(position, `left-${movement + 1}`);
    }
  });

  for (const viewport of HOME_VIEWPORTS) {
    test(`captures the composed HomePage story at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      // Keep the pointer outside the full-height hover rail when the story mounts.
      await page.mouse.move(viewport.width - 1, Math.floor(viewport.height / 2));
      await page.goto(`${STORYBOOK_BASE_URL}?id=home-home-page--browse-visual&viewMode=story`);
      await waitForHomeArtwork(page);

      await expect(page).toHaveScreenshot(`home-page-browse-${viewport.name}.png`, {
        fullPage: false,
        animations: 'disabled',
      });
    });
  }
});
