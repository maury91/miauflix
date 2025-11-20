import { navigateToLogin } from './utils/login';
import { expect, test } from './fixtures';

const LOGIN_API_TIMEOUT = 10000;

const adminEmail = process.env['E2E_ADMIN_EMAIL'] ?? 'test@example.com';
const adminPassword = process.env['E2E_ADMIN_PASSWORD'] ?? 'testpassword123';

test.describe('Login flow', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToLogin(page);
  });

  test('renders the email login form with basic elements', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  test('should display complete login page and take screenshot', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // Wait a bit more for any animations to settle
    await page.waitForTimeout(100);

    await expect(page).toHaveScreenshot('login-page-complete.png', {
      fullPage: true,
      animations: 'disabled',
    });

    const title = await page.title();
    expect(title).toMatch(/miauflix/i);

    const pageContent = await page.content();
    expect(pageContent).toMatch(/miauflix/i);
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

  test.skip('should display responsive layout on different viewport sizes', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    // Wait a bit more for any animations to settle
    await page.waitForTimeout(100);
    await expect(page).toHaveScreenshot('login-page-desktop.png', {
      fullPage: true,
      animations: 'disabled',
    });

    await page.setViewportSize({ width: 768, height: 1024 });
    // Wait a bit more for any animations to settle
    await page.waitForTimeout(100);
    await expect(page).toHaveScreenshot('login-page-tablet.png', {
      fullPage: true,
      animations: 'disabled',
    });

    await page.setViewportSize({ width: 375, height: 667 });
    // Wait a bit more for any animations to settle
    await page.waitForTimeout(100);
    await expect(page).toHaveScreenshot('login-page-mobile.png', {
      fullPage: true,
      animations: 'disabled',
    });

    const emailInput = page.locator('#email').first();
    await expect(emailInput).toBeVisible();
  });

  test('should handle keyboard navigation and accessibility', async ({ page }) => {
    const emailInput = page.locator('#email').first();
    const passwordInput = page.locator('#password').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await expect(emailInput).toHaveAttribute('required');
    await expect(passwordInput).toHaveAttribute('required');

    await emailInput.focus();
    await page.keyboard.type('keyboard@test.com');
    await expect(emailInput).toHaveValue('keyboard@test.com');

    await page.keyboard.press('Tab');
    await page.keyboard.type('keyboardpassword');
    await expect(passwordInput).toHaveValue('keyboardpassword');

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
  });

  test('should display proper visual feedback during form interaction', async ({ page }) => {
    const emailInput = page.locator('#email').first();
    const passwordInput = page.locator('#password').first();

    const emailBorderColor = await emailInput.evaluate(el => getComputedStyle(el).borderColor);

    await emailInput.focus();
    const focusedBorderColor = await emailInput.evaluate(el => getComputedStyle(el).borderColor);
    expect(focusedBorderColor).not.toBe(emailBorderColor);

    await emailInput.pressSequentially('visual@test.com');
    await expect(emailInput).toHaveValue('visual@test.com');

    await passwordInput.focus();
    const passwordFocusColor = await passwordInput.evaluate(el => getComputedStyle(el).borderColor);
    expect(passwordFocusColor).toBe(focusedBorderColor);
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
