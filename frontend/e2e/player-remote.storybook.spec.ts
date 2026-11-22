import { expect, test } from '@playwright/test';

/** Virtual focus is mirrored to DOM focus, so the focused control is the active element. */
const isFocused = (element: Element) => element === document.activeElement;

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

  // OK opens the closed-captions sheet, entered at the language list on the current choice (Off).
  await page.keyboard.press('Enter');
  const settings = page.getByRole('dialog', { name: 'Closed captions' });
  await expect(settings).toBeVisible();
  const off = settings.getByRole('radio', { name: 'Off', exact: true });
  await expect(off).toBeChecked();
  await expect(off).toBeFocused();
  await expect(settings.getByText('Default')).toBeVisible();

  // Choosing a language shows a track in it.
  await page.keyboard.press('ArrowDown');
  const english = settings.getByRole('radio', { name: 'English', exact: true });
  await expect(english).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(english).toBeChecked();

  // Down walks the panel to the sources and the timing.
  const embedded = settings.getByRole('button', { name: /^Embedded/ });
  for (let step = 0; step < 10 && !(await embedded.evaluate(isFocused)); step++)
    await page.keyboard.press('ArrowDown');
  await expect(embedded).toBeFocused();
  // A source opens its own view on its tracks; Back returns to it.
  await page.keyboard.press('Enter');
  const source = page.getByRole('dialog', { name: 'Embedded' });
  await expect(source.getByRole('radio', { name: 'Off', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(embedded).toBeFocused();

  const timing = settings.getByRole('button', { name: /Synchronize subtitles/ });
  for (let step = 0; step < 5 && !(await timing.evaluate(isFocused)); step++)
    await page.keyboard.press('ArrowDown');
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

  // Back leaves timing for the main view, on the timing entry, then closes the sheet on CC.
  await page.keyboard.press('Escape');
  await expect(settings).toBeVisible();
  await expect(timing).toBeFocused();
  await expect(timing).toContainText('+1s');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(cc).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(play).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(overlay).toBeFocused();
});
