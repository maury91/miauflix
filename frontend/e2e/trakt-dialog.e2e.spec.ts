import type { Page } from '@playwright/test';

import { navigateToLogin } from './utils/login';
import { expect, test } from './fixtures';

async function login(page: Page): Promise<string> {
  await page.route('**/api/integrations/trakt/association', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        connected: false,
        provider: 'trakt',
        accountId: null,
        username: null,
      }),
    })
  );
  await navigateToLogin(page);
  await page.getByLabel('Email').fill(process.env['E2E_ADMIN_EMAIL'] ?? 'test@example.com');
  await page.getByLabel('Password').fill(process.env['E2E_ADMIN_PASSWORD'] ?? 'testpassword123');
  const response = page.waitForResponse(response => response.url().endsWith('/api/auth/login'));
  await page.getByRole('button', { name: 'Continue' }).click();
  const result = await (await response).json();
  await expect(page.getByRole('dialog', { name: 'Connect Trakt', exact: true })).toBeVisible();
  return result.user.id;
}

test('contains keyboard navigation and returns control to Home after closing', async ({ page }) => {
  await login(page);
  const dialog = page.getByRole('dialog', { name: 'Connect Trakt', exact: true });
  const begin = dialog.getByRole('button', { name: "Let's go" });
  const dismiss = dialog.getByRole('button', { name: 'Don’t ask again' });
  const close = dialog.getByRole('button', { name: 'Close Trakt dialog' });

  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(begin).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(dismiss).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(close).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(dismiss).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(begin).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const selected = page.locator('main section button[aria-current="true"]');
  await expect(selected).toBeVisible();
  const title = await selected.getAttribute('aria-label');
  await selected.focus();
  await page.keyboard.press('ArrowRight');
  await expect(selected).not.toHaveAttribute('aria-label', title!);
});

test('remembers Don’t ask again when the page reloads', async ({ page }) => {
  const userId = await login(page);
  const dialog = page.getByRole('dialog', { name: 'Connect Trakt', exact: true });
  await dialog.getByRole('button', { name: 'Don’t ask again' }).click();
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate(id => localStorage.getItem(`miauflix:trakt:dont-ask:${id}`), userId)
  ).toBe('1');

  const association = page.waitForResponse(response =>
    response.url().endsWith('/api/integrations/trakt/association')
  );
  await page.reload();
  await association;
  await expect(page.getByRole('main')).toBeVisible();
  await expect(dialog).toBeHidden();
});
