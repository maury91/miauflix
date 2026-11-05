import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';

const STORYBOOK_BASE_URL = 'http://localhost:6006/iframe.html';
const VIEWPORT = { width: 1440, height: 900 };

const storyUrl = (id: string) => `${STORYBOOK_BASE_URL}?id=${id}&viewMode=story`;

/** Fonts and every picture tile loaded, so a screenshot never catches a half-drawn grid. */
async function waitForPictures(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>('img')].every(
      image => image.complete && image.naturalWidth > 0
    )
  );
}

/**
 * Live Plushies are WebGL: their shading differs between GPUs and drivers, so the screenshots
 * cover the pages around them and mask the drawings. The stage is masked rather than its canvas,
 * which only appears once three.js has loaded.
 */
const plushies = (page: Page): Locator[] => [page.locator('[data-plushie]')];

/**
 * Wait until every control keeps its place for a few frames: the editor's tiles settle their
 * size after the first frames, and a baseline caught before that is wrong.
 */
async function waitForStableLayout(page: Page) {
  await page.waitForFunction(
    () =>
      new Promise<boolean>(resolve => {
        const layout = () =>
          [...document.querySelectorAll('button, input, h1, h2, h3')]
            .map(element => {
              const { x, y, width, height } = element.getBoundingClientRect();
              return `${x},${y},${width},${height}`;
            })
            .join(';');
        const before = layout();
        let frames = 0;
        const check = () => {
          if (++frames < 5) requestAnimationFrame(check);
          else resolve(layout() === before);
        };
        requestAnimationFrame(check);
      })
  );
}

async function screenshot(page: Page, name: string) {
  await waitForStableLayout(page);
  // Live Plushies are drawn in software here, which slows each capture down.
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    mask: plushies(page),
    timeout: 20_000,
  });
}

test.describe('Profiles stories - visual regression', () => {
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
          caret-color: transparent !important;
        }
      `;
      // Init scripts can run before <head> exists.
      (document.head ?? document.documentElement).appendChild(style);
    });
    await page.setViewportSize(VIEWPORT);
    // Keep the pointer away from the cards and the rail.
    await page.mouse.move(VIEWPORT.width - 1, VIEWPORT.height - 1);
  });

  test("captures Who's watching with the back rail", async ({ page }) => {
    await page.goto(storyUrl('profiles-who-s-watching--with-admin'));
    // The first story a worker opens waits for Storybook's cold start.
    await expect(page.getByRole('heading', { name: 'Who’s watching?' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Maurizio' })).toBeFocused();
    await waitForPictures(page);
    await screenshot(page, 'whos-watching.png');

    // Left from the first profile reaches the rail's Back button.
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeFocused();
  });

  test('captures Manage profiles with the back rail and no Done button', async ({ page }) => {
    await page.goto(storyUrl('profiles-who-s-watching--manage'));
    await expect(page.getByRole('heading', { name: 'Manage profiles' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Done' })).toHaveCount(0);
    await waitForPictures(page);
    await screenshot(page, 'manage-profiles.png');
  });

  for (const [tab, name] of [
    ['Shape', 'shape'],
    ['Color & fabric', 'color'],
    ['Face', 'face'],
    ['Accessories', 'accessories'],
  ] as const) {
    test(`captures the profile editor's ${tab} tab`, async ({ page }) => {
      await page.goto(storyUrl('profiles-profile-editor--edit'));
      await expect(page.getByRole('heading', { name: 'Edit profile' })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
      await page.mouse.move(VIEWPORT.width - 1, VIEWPORT.height - 1);
      await waitForPictures(page);
      await screenshot(page, `profile-editor-${name}.png`);
    });
  }

  test("captures the sidebar's profile panel", async ({ page }) => {
    await page.goto(storyUrl('home-profile-menu--focused'));
    const panel = page.getByRole('region', { name: 'Profile' });
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByRole('button', { name: 'Switch profile' })).toBeFocused();
    await page.evaluate(() => document.fonts.ready);
    await waitForStableLayout(page);
    await expect(panel).toHaveScreenshot('profile-panel.png', { animations: 'disabled' });
  });
});
