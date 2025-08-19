import { test } from '@playwright/test';

import { createCompositeScreenshot } from './utils/composite-grid';

test.describe('QRDisplay - Visual Tests', () => {
  const STORYBOOK_BASE_URL = 'http://localhost:6006/iframe.html';

  test.beforeEach(async ({ page }) => {
    // Set consistent viewport for screenshot comparisons
    await page.setViewportSize({ width: 1200, height: 800 });

    // Disable animations for consistent snapshots
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `;
      document.head.appendChild(style);
    });
  });

  test('QRDisplay - All states composite', async ({ page }) => {
    // Different QR states to capture
    const qrStates = [
      { name: 'Loading', isLoading: true, qrSize: 140 },
      { name: 'Loading Large', isLoading: true, qrSize: 200 },
      { name: 'Normal (10min)', timeRemaining: 600, userCode: 'ABC123DEF456' },
      { name: 'Normal (5min)', timeRemaining: 300, userCode: 'XYZ789GHI012' },
      { name: 'Warning (45s)', timeRemaining: 45, userCode: 'WARN45SEC123' },
      { name: 'Warning (15s)', timeRemaining: 15, userCode: 'WARN15SEC456' },
      { name: 'Expired', timeRemaining: 0, userCode: 'EXPIRED00000' },
      { name: 'Small QR', timeRemaining: 420, userCode: 'SMALL100PX12', qrSize: 100 },
      { name: 'Large QR', timeRemaining: 540, userCode: 'LARGE200PX34', qrSize: 200 },
    ];

    const frameWidth = 320;
    const frameHeight = 280;
    const footerHeight = 30;

    await createCompositeScreenshot({
      page,
      frames: qrStates,
      frameWidth,
      frameHeight,
      footerHeight,
      cols: 3,
      screenshotName: 'qr-display-states-composite.png',
      styles: '.label { color: white; }',
      disableAnimations: true,
      async render(state) {
        const qrSize = state.qrSize || 140;

        let argsParam = `qrSize%3A${qrSize}`;

        if (state.isLoading) {
          argsParam += `%3BisLoading%3Atrue`;
        } else {
          argsParam += `%3BisLoading%3Afalse%3BtimeRemaining%3A${state.timeRemaining}%3BuserCode%3A${state.userCode}%3BcodeUrl%3Ahttps%253A%252F%252Fmiauflix.local%252Fauth%252Fdevice%253Fcode%253D${state.userCode}`;
        }

        await page.goto(
          `${STORYBOOK_BASE_URL}?id=login-qrdisplay--interactive&args=${argsParam}&viewMode=story`
        );
        await page.waitForLoadState('networkidle');

        if (state.isLoading) {
          // Wait for spinner to render
          await page.waitForSelector('svg', { timeout: 10000 });
          await page.waitForTimeout(1000);
        } else {
          // Wait for QR code to render
          await page.waitForSelector('[aria-label="Login QR code"]', { timeout: 10000 });
          await page.waitForTimeout(1000);
        }

        return `<div class="label">${state.name}</div>`;
      },
    });
  });
});
