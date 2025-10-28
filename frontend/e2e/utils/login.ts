import type { Page } from '@playwright/test';

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
