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
    const urls = [...document.querySelectorAll<HTMLElement>('button')].flatMap(element => {
      const background = getComputedStyle(element).backgroundImage;
      return [...background.matchAll(/url\((?:"|')?([^"')]+)(?:"|')?\)/g)].map(match => match[1]);
    });
    return urls.length > 0;
  });
  await page.waitForFunction(async () => {
    const urls = [...document.querySelectorAll<HTMLElement>('button')].flatMap(element => {
      const background = getComputedStyle(element).backgroundImage;
      return [...background.matchAll(/url\((?:"|')?([^"')]+)(?:"|')?\)/g)].map(match => match[1]);
    });
    const uniqueUrls = [...new Set(urls)];
    return Promise.all(
      uniqueUrls.map(
        url =>
          new Promise<boolean>(resolve => {
            const image = new Image();
            image.onload = () => resolve(true);
            image.onerror = () => resolve(false);
            image.src = url;
          })
      )
    ).then(results => results.every(Boolean));
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

    await expect(page).toHaveScreenshot('category-row-loaded.png', {
      fullPage: false,
      animations: 'disabled',
    });
  });

  test('captures fixed CategoryRow arrow positions at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(
      `${STORYBOOK_BASE_URL}?id=home-category-row--arrow-sequence-visual&viewMode=story`
    );
    await waitForHomeArtwork(page);

    const scrollContainer = page.getByTestId('category-row-scroll-container');
    const next = page.getByRole('button', { name: 'Next Popular Movies items' });
    const previous = page.getByRole('button', { name: 'Previous Popular Movies items' });
    const stride = 253.44 + 14.4;
    const screenshot = async (position: number, name: string) => {
      await expect
        .poll(() => scrollContainer.evaluate(element => element.scrollLeft))
        .toBe(Math.round(position * stride));
      await expect(page.locator('[aria-current="true"]')).toHaveCount(1);
      await expect(page).toHaveScreenshot(`category-row-arrow-${name}.png`, {
        fullPage: false,
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
