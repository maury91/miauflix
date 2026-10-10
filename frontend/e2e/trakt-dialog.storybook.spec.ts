import { expect, test } from './fixtures';

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`captures the Trakt dialog at ${viewport.name} size`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(
      'http://localhost:6006/iframe.html?id=home-trakt-modal--landing&viewMode=story'
    );
    const dialog = page.getByRole('dialog', { name: 'Connect Trakt', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: "Let's go" })).toBeFocused();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`trakt-dialog-${viewport.name}.png`, {
      animations: 'disabled',
    });
  });
}
