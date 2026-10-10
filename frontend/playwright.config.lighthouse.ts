import { defineConfig } from '@playwright/test';

import { CDP_PORT_MAP, DEFAULT_CDP_PORT } from './e2e/test-constants';
import baseConfig from './playwright.config.e2e';

const projects = baseConfig.projects?.map(project => ({
  ...project,
  use: {
    ...project.use,
    launchOptions: {
      ...project.use.launchOptions,
      args: [
        ...(project.use.launchOptions?.args ?? []),
        `--remote-debugging-port=${CDP_PORT_MAP[project.name] ?? DEFAULT_CDP_PORT}`,
      ],
    },
  },
}));

export default defineConfig({
  ...baseConfig,
  testMatch: '**/lighthouse.e2e.spec.ts',
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-lighthouse', open: 'never' }],
    ['json', { outputFile: 'test-results-lighthouse/results.json' }],
  ],
  outputDir: './test-results-lighthouse',
  projects,
});
