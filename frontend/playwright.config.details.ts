import { defineConfig, devices } from '@playwright/test';

/**
 * Offline details-page contract lane. The test intercepts every application API
 * request, so it exercises the browser app without Docker, providers, or a
 * WebTorrent process.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/details-*.e2e.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-details', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    extraHTTPHeaders: { 'X-Test-Mode': 'true' },
  },
  timeout: 90000,
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        launchOptions: {
          args: [
            '--force-device-scale-factor=1',
            '--force-color-profile=srgb',
            '--disable-font-subpixel-positioning',
            '--disable-lcd-text',
            '--disable-gpu-rasterization',
            '--disable-gpu-compositing',
            '--disable-accelerated-2d-canvas',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'MIAUFLIX_TEST_HTTP=true npx vite --host localhost --port 4174',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env['CI'],
    timeout: 120000,
  },
  outputDir: './test-results-details',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}-snapshots/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixels: 500,
    },
  },
});
