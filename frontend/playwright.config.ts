import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env['CI'],
  /* Retry on CI only */
  retries: process.env['CI'] ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env['CI'] ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html'], ['json', { outputFile: 'test-results/results.json' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:4174',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video recording for debugging animation tests */
    video: 'retain-on-failure',

    /* Longer timeout for animation tests */
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

    {
      name: 'firefox-desktop',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    {
      name: 'webkit-desktop',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    /* Storybook visual tests with optimized settings */
    {
      name: 'storybook-chromium',
      testMatch: '**/*.storybook.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        video: 'retain-on-failure',
        deviceScaleFactor: 1,
        launchOptions: {
          args: [
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            // Font rendering consistency
            '--disable-font-subpixel-positioning',
            '--disable-gpu-rasterization',
            '--disable-gpu-compositing',
            '--disable-software-rasterizer',
            '--force-device-scale-factor=1',
            '--force-color-profile=srgb',
            '--disable-lcd-text',
            '--disable-accelerated-2d-canvas',
            // Additional stability options
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-default-apps',
          ],
        },
      },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    /* High DPI testing */
    {
      name: 'high-dpi',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
        launchOptions: {
          args: [
            '--force-device-scale-factor=2',
            '--force-color-profile=srgb',
            '--disable-font-subpixel-positioning',
          ],
        },
      },
    },
  ],

  /* Run your local dev server before starting tests */
  webServer: {
    command: 'npx storybook dev -p 6006 --no-open',
    url: 'http://localhost:6006',
    reuseExistingServer: !process.env['CI'],
    timeout: 120000,
  },

  /* Test output directory */
  outputDir: './test-results',

  /* Screenshot comparison settings */
  expect: {
    // More lenient thresholds for animation screenshots
    toHaveScreenshot: {
      threshold: 0.25,
      maxDiffPixels: 800,
      // maxDiffPixelRatio: 0.02,
      // Animation handling
      animations: 'disabled',
    },
    toMatchSnapshot: {
      threshold: 0.25,
      maxDiffPixels: 800,
    },
  },

  /* Global setup and teardown */
  globalSetup: process.env['ANIMATION_TESTS'] ? './e2e/global-setup.ts' : undefined,
});
