import { expect, test } from '@playwright/test';

test('selects subtitles and shifts cues with remote keys only', async ({ page }) => {
  await page.goto(
    'http://localhost:6006/iframe.html?id=home-player-controls--remote-subtitles&viewMode=story'
  );
  const overlay = page.getByLabel('Playback controls', { exact: true });
  await expect(overlay).toBeFocused({ timeout: 30000 });
  const back = page.getByRole('button', { name: 'Back to details' });
  const play = page.getByRole('button', { name: 'Play', exact: true });
  // Up and Down move between the header, the overlay, play/pause and the control row.
  await page.keyboard.press('ArrowUp');
  await expect(back).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(overlay).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(play).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const cc = page.getByRole('button', { name: 'Subtitles', exact: true });
  await expect(cc).toBeFocused();

  // OK opens the subtitle settings popover, entered at the language (virtual focus: the
  // design-system Select opens its native list only on OK).
  await page.keyboard.press('Enter');
  const settings = page.getByRole('dialog', { name: 'Subtitle settings' });
  await expect(settings).toBeVisible();
  const language = settings.getByRole('combobox', { name: 'Subtitle language' });
  await expect(language).toHaveValue('en');
  await expect(language.locator('xpath=..')).toHaveAttribute('data-focused', 'true');

  await page.keyboard.press('ArrowDown');
  await expect(settings.getByRole('switch', { name: 'Hearing impaired' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(settings.getByRole('button', { name: 'Find subtitles' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(settings.getByRole('radio', { name: 'Off', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const english = settings.getByRole('radio', { name: 'English · Torrent file' });
  await expect(english).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(english).toBeChecked();

  // The timing entry appears once a track is chosen.
  await page.keyboard.press('ArrowDown');
  const timing = settings.getByRole('button', { name: /Adjust subtitle timing/ });
  await expect(timing).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Subtitle timing' })).toBeVisible();
  const adjustment = page.getByRole('slider', { name: 'Subtitle timing adjustment' });
  await expect(adjustment).toBeFocused();
  await expect(page.getByText('First subtitle')).toBeVisible();
  // Each key moves the cues by half a second.
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

  // Back leaves timing for the settings, on the timing entry, then closes the popover on CC.
  await page.keyboard.press('Escape');
  await expect(settings).toBeVisible();
  await expect(timing).toBeFocused();
  await expect(timing).toContainText('1');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(cc).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(play).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(overlay).toBeFocused();
});
