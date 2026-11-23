import type { Locator, Page } from '@playwright/test';

import { navigateToLogin } from './utils/login';
import { expect, test } from './fixtures';

const LOGIN_API_TIMEOUT = 10000;

const adminEmail = process.env['E2E_ADMIN_EMAIL'] ?? 'test@example.com';
const adminPassword = process.env['E2E_ADMIN_PASSWORD'] ?? 'testpassword123';

async function openLoginForScreenshot(page: Page) {
  // QR content and the countdown are generated per login request, so serve a fixed QR
  // request and freeze the clock to keep the screenshot stable. An absolute approval URL
  // keeps the QR independent of the origin the backend runs on.
  const now = new Date('2026-01-01T12:00:00.000Z');
  await page.clock.setFixedTime(now);
  await page.route('**/api/auth/qr', route =>
    route.fulfill({
      json: {
        requestId: 'readme-qr-request',
        claimToken: 'readme-qr-claim',
        approvalPath: 'https://miauwatch.example/auth/qr/readme-qr-approval',
        expiresAt: new Date(now.getTime() + 4 * 60_000 + 32_000).toISOString(),
        pollInterval: 5,
      },
    })
  );
  await page.route('**/api/auth/qr/*/claim', route =>
    route.fulfill({ status: 202, json: { state: 'pending' } })
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await navigateToLogin(page);
  // The login page fades in via a framer-motion opacity animation (JS-driven, not a
  // CSS transition/animation), so Playwright's `animations: 'disabled'` option cannot
  // fast-forward it. Wait for the fade-in to fully settle before comparing screenshots.
  await page.waitForFunction(() => {
    let node: Element | null = document.querySelector('#email');
    while (node) {
      if (getComputedStyle(node).position === 'fixed') {
        return getComputedStyle(node).opacity === '1';
      }
      node = node.parentElement;
    }
    return true;
  });
}

test.describe('Login flow', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToLogin(page);
  });

  test('renders the email login form with basic elements', async ({ page }) => {
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  test('captures the complete login page @snapshot', async ({ page, isMobile }) => {
    await openLoginForScreenshot(page);
    const countdown = page.getByText('Expires in');
    if (isMobile) await expect(countdown).toBeHidden();
    else await expect(countdown).toBeVisible();

    await expect(page).toHaveScreenshot('login-page-complete.png', {
      fullPage: true,
      animations: 'disabled',
    });

    await expect(page).toHaveTitle('Miauwatch');
    await expect(page.getByAltText('Miauwatch logo')).toBeVisible();
  });

  test('should have functional login form elements with validation', async ({ page }) => {
    const emailInput = page.locator('#email').first();
    const passwordInput = page.locator('#password').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await expect(emailInput).toBeVisible();
    await expect(emailInput).toBeEnabled();
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toBeEnabled();
    await expect(submitButton).toBeDisabled();

    await emailInput.fill('test@example.com');
    await expect(emailInput).toHaveValue('test@example.com');
    await expect(submitButton).toBeDisabled();

    await passwordInput.fill('testpassword123');
    await expect(passwordInput).toHaveValue('testpassword123');
    await expect(submitButton).toBeEnabled();
  });

  test('captures responsive login layouts @snapshot', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Compare viewport widths at one DPI');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openLoginForScreenshot(page);
    const countdown = page.getByText('Expires in');
    await expect(countdown).toBeVisible();

    const layouts = [
      { name: 'desktop', width: 1920, height: 1080, showQR: true },
      { name: 'tablet', width: 768, height: 1024, showQR: true },
      { name: 'mobile', width: 375, height: 667, showQR: false },
    ] as const;
    for (const { name, width, height, showQR } of layouts) {
      await page.setViewportSize({ width, height });
      if (showQR) await expect(countdown).toBeVisible();
      else await expect(countdown).toBeHidden();
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page).toHaveScreenshot(`login-page-${name}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    }
  });

  test('should handle keyboard navigation and accessibility', async ({ page }) => {
    const emailInput = page.locator('#email').first();
    const passwordInput = page.locator('#password').first();
    const passwordToggle = page.getByRole('button', { name: 'Show password' });
    const submitButton = page.locator('button[type="submit"]').first();

    await expect(emailInput).toHaveAttribute('required');
    await expect(passwordInput).toHaveAttribute('required');

    await emailInput.focus();
    await page.keyboard.type('keyboard@test.com');
    await expect(emailInput).toHaveValue('keyboard@test.com');

    await page.keyboard.press('Tab');
    await page.keyboard.type('keyboardpassword');
    await expect(passwordInput).toHaveValue('keyboardpassword');

    // The show-password toggle sits between the password and the submit button
    await page.keyboard.press('Tab');
    await expect(passwordToggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Hide password' })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(submitButton).toBeFocused();
    await expect(submitButton).toBeEnabled();
  });

  test('should successfully login with admin credentials', async ({ page }) => {
    const emailInput = page.locator('#email').first();
    const passwordInput = page.locator('#password').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await emailInput.fill(adminEmail);
    await passwordInput.fill(adminPassword);
    await expect(submitButton).toBeEnabled();

    const loginResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/login'),
      { timeout: LOGIN_API_TIMEOUT }
    );

    await submitButton.click();

    const loginResponse = await loginResponsePromise;
    const statusCode = loginResponse.status();

    expect(statusCode).toBe(200);
    // Signing in adds the profile to the device; Who's watching then picks who is watching.
    const selector = page.getByRole('main', { name: 'Who’s watching?' });
    await expect(selector).toBeVisible({ timeout: 30000 });
    await expect(selector.locator('[data-profile-id]').first()).toBeFocused();
  });

  test('should display proper visual feedback during form interaction', async ({ page }) => {
    const emailInput = page.locator('#email').first();
    const passwordInput = page.locator('#password').first();
    const outlineOpacity = (input: Locator) =>
      input.locator('..').evaluate(frame => getComputedStyle(frame, '::after').opacity);

    await expect.poll(() => outlineOpacity(emailInput)).toBe('1');
    await expect.poll(() => outlineOpacity(passwordInput)).toBe('0');

    await emailInput.focus();
    await emailInput.pressSequentially('visual@test.com');
    await expect(emailInput).toHaveValue('visual@test.com');

    await passwordInput.focus();
    await expect.poll(() => outlineOpacity(passwordInput)).toBe('1');
    await expect.poll(() => outlineOpacity(emailInput)).toBe('0');
  });

  test('should handle rapid typing and input changes correctly', async ({ page }) => {
    const emailInput = page.locator('#email').first();
    const passwordInput = page.locator('#password').first();

    await emailInput.click();
    await emailInput.pressSequentially('rapid', { delay: 50 });
    await emailInput.pressSequentially('@typing.com', { delay: 30 });
    await expect(emailInput).toHaveValue('rapid@typing.com');

    await emailInput.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
    await emailInput.pressSequentially('edited@email.com');
    await expect(emailInput).toHaveValue('edited@email.com');

    await passwordInput.click();
    await passwordInput.pressSequentially('Pass123!@#$%');
    await expect(passwordInput).toHaveValue('Pass123!@#$%');

    await emailInput.clear();
    await passwordInput.clear();
    await expect(emailInput).toHaveValue('');
    await expect(passwordInput).toHaveValue('');
  });

  test('should have responsive email and password inputs with advanced interaction', async ({
    page,
  }) => {
    const emailInput = page.locator('#email').first();
    const passwordInput = page.locator('#password').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await expect(emailInput).toBeVisible();
    await expect(emailInput).toBeEnabled();
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toBeEnabled();
    await expect(submitButton).toBeDisabled();

    await emailInput.fill('user@test.com');
    await expect(emailInput).toHaveValue('user@test.com');
    await expect(submitButton).toBeDisabled();

    await passwordInput.fill('mypassword123');
    await expect(passwordInput).toHaveValue('mypassword123');
    await expect(submitButton).toBeEnabled();

    await emailInput.selectText();
    await emailInput.type('new@email.com');
    await expect(emailInput).toHaveValue('new@email.com');

    await emailInput.focus();
    await expect(emailInput).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(passwordInput).toBeFocused();
  });
});
