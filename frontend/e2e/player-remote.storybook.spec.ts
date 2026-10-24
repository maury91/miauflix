import { expect, test } from '@playwright/test';

test('selects subtitles and shifts cues with remote keys only', async ({ page }) => {
  await page.goto(
    'http://localhost:6006/iframe.html?id=home-player-controls--remote-subtitles&viewMode=story'
  );
  const overlay = page.getByLabel('Playback controls', { exact: true });
  await expect(overlay).toBeFocused({ timeout: 30000 });
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Back to details' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('slider', { name: 'Seek', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const cc = page.getByRole('button', { name: 'Subtitles', exact: true });
  await expect(cc).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Subtitle language' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Subtitle language' })).toContainText('Lithuanian');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: 'Subtitle language' })).toContainText('English');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Hearing impaired: Off' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Find subtitles' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Off', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'English · Torrent file' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'English · Torrent file' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: /Adjust subtitle timing/ })).toBeFocused();
  await page.keyboard.press('Enter');
  const adjustment = page.getByRole('slider', { name: 'Subtitle timing adjustment' });
  await expect(adjustment).toBeFocused();
  await expect(page.getByText('First subtitle')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(adjustment).toHaveValue('1');
  await expect
    .poll(() =>
      page
        .locator('video')
        .evaluate(video => (video as HTMLVideoElement).textTracks[0].cues?.[0].startTime)
    )
    .toBe(1);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /Adjust subtitle timing/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(adjustment).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Adjust subtitle timing/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(cc).toBeFocused();
  await expect(page.getByRole('group', { name: 'Subtitle settings', exact: true })).toHaveCount(0);
  await page.keyboard.press('ArrowUp');
  await expect(overlay).toBeFocused();
});
