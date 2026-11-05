import type { Page, Response } from '@playwright/test';

import { expect } from '../fixtures';

export async function navigateToLogin(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#email', { state: 'visible', timeout: 5000 });
}

/**
 * After signing in, Who's watching asks which profile is watching: pick `name`, or the first
 * profile. Does nothing when a profile was already chosen in this browser tab.
 */
export async function chooseProfile(page: Page, name?: string): Promise<void> {
  const selector = page.getByRole('main', { name: 'Who’s watching?' });
  const firstScreen = page.getByRole('main').first();
  await expect(firstScreen).toBeVisible({ timeout: 30000 });
  if (!(await selector.isVisible())) return;
  const profile = name
    ? selector.getByRole('button', { name, exact: true })
    : selector.getByRole('listitem').first().getByRole('button');
  await profile.click();
  await expect(selector).toBeHidden({ timeout: 30000 });
}

/** Wait until Home has finished its intro and is available to browser interaction. */
export async function waitForHomeReady(page: Page): Promise<void> {
  await chooseProfile(page);
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
