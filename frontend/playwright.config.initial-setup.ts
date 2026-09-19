import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.config.e2e';

export default defineConfig({
  ...baseConfig,
  testMatch: '**/initial-user-setup.e2e.spec.ts',
  testIgnore: [],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  projects: baseConfig.projects?.filter(project => project.name === 'chromium-desktop'),
  use: {
    ...baseConfig.use,
    trace: 'retain-on-failure',
  },
  outputDir: './test-results-initial-setup',
  reporter: [
    ['html', { outputFolder: 'playwright-report-initial-setup', open: 'never' }],
    ['json', { outputFile: 'test-results-initial-setup/results.json' }],
  ],
});
