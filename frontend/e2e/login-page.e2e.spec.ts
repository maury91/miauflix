/// <reference types="./global.d.ts" />

import { expect, test } from '@playwright/test';

test.describe('Login Page - E2E Testing', () => {
  test.beforeEach(async ({ page }) => {
    // Set up animation event listener before navigation
    await page.addInitScript(() => {
      console.log('🔧 Setting up animation event listener...');

      window.addEventListener('miauflix:intro:animation:complete', () => {
        console.log('🎬 Animation complete event received!');
        window._miauflixAnimationComplete = true;
      });

      console.log('🔧 Event listener setup complete');
    });

    // Navigate to main page ( user is not logged in so it's the login page )
    await page.goto('/');

    // Wait for the animation to complete
    await page.waitForFunction(
      () => window._miauflixAnimationComplete === true,
      {},
      { timeout: 10000 }
    );
  });

  test('should display complete login page and take screenshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('login-page-complete.png', {
      fullPage: true,
      animations: 'disabled', // Disable animations for consistent screenshots
    });

    // Verify page title contains expected content
    const title = await page.title();
    expect(title).toMatch(/miauflix/i);

    // Verify page has expected content
    const pageContent = await page.content();
    expect(pageContent).toMatch(/miauflix/i);
  });

  test('should have functional login form elements', async ({ page }) => {
    // Test email input functionality
    const emailInput = page
      .locator('input[type="email"], input[placeholder*="email" i], #email')
      .first();
    await emailInput.fill('test@example.com');
    await expect(emailInput).toHaveValue('test@example.com');
    console.log('✅ Email input is functional');

    // Test password input functionality
    const passwordInput = page
      .locator('input[type="password"], input[placeholder*="password" i], #password')
      .first();
    await passwordInput.fill('testpassword123');
    await expect(passwordInput).toHaveValue('testpassword123');
    console.log('✅ Password input is functional');

    // Test submit button is enabled with valid input
    const submitButton = page
      .locator(
        'button[type="submit"], button:has-text("Continue"), button:has-text("Sign"), button:has-text("Login")'
      )
      .first();
    await expect(submitButton).toBeEnabled();
    console.log('✅ Submit button is enabled with valid input');
  });

  test.skip('should display responsive layout on different viewport sizes', async ({ page }) => {
    // Test desktop viewport (default)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page).toHaveScreenshot('login-page-desktop.png', {
      fullPage: true,
      animations: 'disabled',
    });
    console.log('✅ Desktop layout screenshot taken');

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page).toHaveScreenshot('login-page-tablet.png', {
      fullPage: true,
      animations: 'disabled',
    });
    console.log('✅ Tablet layout screenshot taken');

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page).toHaveScreenshot('login-page-mobile.png', {
      fullPage: true,
      animations: 'disabled',
    });
    console.log('✅ Mobile layout screenshot taken');

    // Verify form elements are still accessible on mobile
    const emailInput = page
      .locator('input[type="email"], input[placeholder*="email" i], #email')
      .first();
    await expect(emailInput).toBeVisible();
    console.log('✅ Form elements remain accessible on mobile');
  });
});
