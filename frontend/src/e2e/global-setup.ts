import { chromium } from '@playwright/test';

async function globalSetup() {
  console.log('🎭 Starting Playwright Global Setup for Animation Tests');

  // Launch browser to perform any global initialization
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Pre-warm the frontend
    console.log('🔥 Pre-warming frontend server...');
    await page.goto('http://localhost:4174');
    await page.waitForSelector('body', { timeout: 10000 });

    // Check backend connectivity
    console.log('🔗 Testing backend connectivity...');
    const backendResponse = await page.request.get('http://localhost:3001/health');
    if (backendResponse.ok()) {
      console.log('✅ Backend mock server is responsive');
    } else {
      console.warn('⚠️  Backend mock server not responding');
    }

    // Inject test utilities into global scope
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

    console.log('✅ Global setup completed successfully');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
