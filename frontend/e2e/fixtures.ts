import { test as base } from '@playwright/test';

// Extend the base test to include custom fixtures
export const test = base.extend({
  page: async ({ page }, testUse) => {
    // Inject test utilities into every test page
    await page.addInitScript(() => {
      // Performance monitoring utilities
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).testUtils = {
        performanceObserver: new PerformanceObserver(list => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).performanceEntries = [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...((window as any).performanceEntries || []),
            ...list.getEntries(),
          ];
        }),

        startPerformanceMonitoring() {
          this.performanceObserver.observe({ entryTypes: ['measure', 'mark', 'navigation'] });
        },

        getPerformanceData() {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (window as any).performanceEntries || [];
        },
      };
    });

    // Use the page fixture
    await testUse(page);
  },
});

// Re-export expect for convenience
export { expect } from '@playwright/test';
