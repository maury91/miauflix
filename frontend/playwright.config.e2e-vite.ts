import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for integrated testing through Vite proxy
 * This config automatically starts Vite preview server which proxies API calls to backend-e2e environment
 * Tests run against the built frontend with realistic proxy setup.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  /* Only run e2e test files */
  testMatch: '**/*.e2e.spec.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env['CI'],
  /* Retry on CI only */
  retries: process.env['CI'] ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env['CI'] ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html'], ['json', { outputFile: 'test-results-e2e/results.json' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL - Vite preview server with proxy to backend */
    baseURL: 'http://localhost:4174',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video recording for debugging */
    video: 'retain-on-failure',

    /* Longer timeout for e2e environment */
    actionTimeout: 15000,
    navigationTimeout: 30000,

    /* Environment variables for testing */
    extraHTTPHeaders: {
      'X-Test-Mode': 'true',
    },
  },

  /* Global test timeout */
  timeout: 60000,

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    // {
    //   name: 'firefox-desktop',
    //   use: {
    //     ...devices['Desktop Firefox'],
    //     viewport: { width: 1920, height: 1080 },
    //   },
    // },

    // {
    //   name: 'webkit-desktop',
    //   use: {
    //     ...devices['Desktop Safari'],
    //     viewport: { width: 1920, height: 1080 },
    //   },
    // },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* High DPI testing */
    {
      name: 'high-dpi',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
      },
    },
  ],

  /* Web server configuration - auto-start Vite preview with backend proxy */
  webServer: {
    command: 'npm run preview',
    port: 4174,
    env: {
      // Pass backend URL to Vite for proxy configuration
      API_URL: process.env['BACKEND_URL'] || 'http://localhost:3000',
    },
    reuseExistingServer: !process.env['CI'],
    stdout: 'pipe',
    stderr: 'pipe',
  },

  /* Test output directory */
  outputDir: './test-results-e2e',

  /* Screenshot comparison settings */
  expect: {
    // More lenient thresholds for e2e testing
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixels: 500,
    },
    toMatchSnapshot: {
      threshold: 0.2,
      maxDiffPixels: 500,
    },
  },

  /* Global setup for e2e testing */
  globalSetup: './e2e/global-setup.e2e-vite.ts',
});
