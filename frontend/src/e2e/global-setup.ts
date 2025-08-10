import { chromium } from '@playwright/test';

async function globalSetup() {
  console.log('🎭 Starting Playwright Global Setup for Animation Tests');

  // Extract backend URL from environment variables
  const backendUrl = process.env['BACKEND_URL'] || 'http://localhost:3001';

  console.log(`🌐 Backend URL: ${backendUrl}`);

  // Launch browser to perform any global initialization
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Pre-warm the frontend (uses baseURL from Playwright config automatically)
    console.log('🔥 Pre-warming frontend server...');
    await page.goto('/');
    await page.waitForSelector('body', { timeout: 10000 });

    // Check backend connectivity
    console.log('🔗 Testing backend connectivity...');
    const backendResponse = await page.request.get(`${backendUrl}/health`);
    if (backendResponse.ok()) {
      console.log('✅ Backend mock server is responsive');
    } else {
      console.warn('⚠️  Backend mock server not responding');
    }

    console.log('✅ Global setup completed successfully');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
