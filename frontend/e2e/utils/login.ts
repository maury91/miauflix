import type { Page } from '@playwright/test';

import { expect } from '../fixtures';

function setAnimationCompleteFlag(isComplete: boolean): void {
  window._miauflixAnimationComplete = isComplete;
}

function isAnimationComplete(): boolean {
  return window._miauflixAnimationComplete === true;
}

export async function navigateToLogin(page: Page): Promise<void> {
  // Install before navigation so the real intro timeline's timers are
  // controlled. Run enough time to cover the audio fallback and 2.5s GSAP
  // animation, then leave the clock running for the rest of the test.
  await page.clock.install();
  await page.addInitScript(setAnimationCompleteFlag, false);

  await page.goto('/');
  await page.clock.runFor(4000);

  await page.waitForFunction(isAnimationComplete, undefined, {
    timeout: 15000,
  });

  await page.waitForSelector('#email', { state: 'visible', timeout: 5000 });
}

export async function dismissTraktPrompt(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Connect Trakt', exact: true });
  if (!(await dialog.isVisible())) return;
  await dialog.getByRole('button', { name: 'Close Trakt dialog' }).click();
  await expect(dialog).toBeHidden();
}
