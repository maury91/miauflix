import { defineConfig, devices } from '@playwright/test';

const production = process.env['SMOOTH_BUILD'] === 'production';
const port = production ? 4176 : 4175;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'smooth-core-flows.e2e.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 90000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    baseURL: process.env['SMOOTH_BASE_URL'] ?? `http://localhost:${port}`,
    storageState: process.env['SMOOTH_STORAGE_STATE'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env['SMOOTH_BASE_URL']
    ? undefined
    : {
        command: production
          ? `MIAUFLIX_TEST_HTTP=true npm run build:ssr && MIAUFLIX_TEST_HTTP=true npx vite preview --host localhost --port ${port}`
          : `MIAUFLIX_TEST_HTTP=true npx vite --host localhost --port ${port}`,
        url: `http://localhost:${port}`,
        reuseExistingServer: !process.env['CI'],
        timeout: 180000,
      },
  outputDir: `./test-results-smooth-core-flows-${production ? 'production' : 'development'}`,
});
