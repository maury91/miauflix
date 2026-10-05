import type { Page } from '@playwright/test';

import { expect } from '../fixtures';

function setAnimationCompleteFlag(isComplete: boolean): void {
  window._miauflixAnimationComplete = isComplete;
}

function isAnimationComplete(): boolean {
  return window._miauflixAnimationComplete === true;
}

export async function navigateToLogin(page: Page): Promise<void> {
  await page.addInitScript(setAnimationCompleteFlag, false);

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.waitForFunction(isAnimationComplete, undefined, {
    timeout: 15000,
  });

  await page.waitForSelector('#email', { state: 'visible', timeout: 5000 });
}

export async function dismissTraktPrompt(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Connect Trakt', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close Trakt dialog' }).click();
  await expect(dialog).toBeHidden();
}
