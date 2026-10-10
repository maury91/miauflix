import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.config.e2e';

/**
 * Offline voting contract lane. It owns all seven voting cases across the
 * desktop, mobile, and high-DPI projects removed from the Docker lane.
 */
export default defineConfig({
  ...baseConfig,
  // Application APIs are intercepted; the Docker backend is not part of this lane.
  globalSetup: undefined,
  testMatch: '**/details-voting.e2e.spec.ts',
  testIgnore: [],
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-details-voting', open: 'never' }],
  ],
  projects: baseConfig.projects,
  use: {
    baseURL: 'http://localhost:4174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    extraHTTPHeaders: { 'X-Test-Mode': 'true' },
  },
  timeout: 90000,
  webServer: {
    command: 'MIAUFLIX_TEST_HTTP=true npx vite --host localhost --port 4174',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env['CI'],
    timeout: 120000,
  },
  outputDir: './test-results-details-voting',
  expect: {
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixels: 500,
    },
  },
});
