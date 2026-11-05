import type { Page, Response } from '@playwright/test';

import { expect } from '../fixtures';

export async function navigateToLogin(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#email', { state: 'visible', timeout: 5000 });
}

/** Wait until Home has finished its intro and is available to browser interaction. */
export async function waitForHomeReady(page: Page): Promise<void> {
  const home = page.getByRole('main');
  await expect(home).toBeVisible({ timeout: 30000 });
  await expect(home.locator('..')).not.toHaveAttribute('aria-hidden', 'true', {
    timeout: 30000,
  });
}

/** Home opens the Trakt prompt only after 5 s without input; leave headroom for slow CI. */
export const TRAKT_PROMPT_TIMEOUT_MS = 15_000;

export function waitForTraktAssociation(page: Page): Promise<Response> {
  return page.waitForResponse(response => {
    const url = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      url.pathname === '/api/integrations/trakt/association'
    );
  });
}

export async function dismissTraktPrompt(
  page: Page,
  associationResponse: Promise<Response>
): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Connect Trakt', exact: true });
  const response = await associationResponse;
  if (response.ok()) {
    const association = (await response.json()) as { connected?: boolean };
    if (association.connected) {
      await expect(dialog).toBeHidden();
      return;
    }
  }
  await expect(dialog).toBeVisible({ timeout: TRAKT_PROMPT_TIMEOUT_MS });
  await dialog.getByRole('button', { name: 'Close Trakt dialog' }).click();
  await expect(dialog).toBeHidden();
}
