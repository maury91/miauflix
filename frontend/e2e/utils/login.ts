import type { Page, Response } from '@playwright/test';

import { expect } from '../fixtures';

export async function navigateToLogin(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#email', { state: 'visible', timeout: 5000 });
}

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
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close Trakt dialog' }).click();
  await expect(dialog).toBeHidden();
}
