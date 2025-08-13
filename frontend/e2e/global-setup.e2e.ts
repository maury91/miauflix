import { chromium } from '@playwright/test';

/**
 * Global setup for integrated testing with backend-e2e environment
 * This assumes the backend-e2e Docker environment is already running
 * and performing health checks to ensure everything is ready.
 */
async function globalSetup() {
  console.log('🎭 Starting Playwright Global Setup for E2E Testing');

  // Extract backend URL from environment variables
  const backendUrl = process.env['BACKEND_URL'] || 'http://localhost:3000';
  console.log(`🌐 Backend URL: ${backendUrl}`);

  // Launch browser for connectivity checks
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Check backend health endpoint
    console.log('🔍 Checking backend-e2e environment health...');
    const healthResponse = await page.request.get(`${backendUrl}/api/health`);

    if (!healthResponse.ok()) {
      throw new Error(`Backend health check failed with status ${healthResponse.status()}`);
    }

    const healthData = await healthResponse.json();
    console.log('✅ Backend health check passed:', healthData);

    // Check that frontend is being served by backend
    console.log('🔍 Verifying frontend is served by backend...');
    const frontendResponse = await page.request.get(backendUrl);

    if (!frontendResponse.ok()) {
      throw new Error(`Frontend serving check failed with status ${frontendResponse.status()}`);
    }

    const contentType = frontendResponse.headers()['content-type'];
    if (!contentType || !contentType.includes('text/html')) {
      throw new Error(`Expected HTML content, got: ${contentType}`);
    }

    console.log('✅ Frontend is being served by backend');

    // Test navigation to login page
    console.log('🔍 Testing login page accessibility...');
    await page.goto(`${backendUrl}/login`);

    // Wait for basic page structure to load
    await page.waitForSelector('body', { timeout: 10000 });

    // Check if this looks like the login page
    const pageContent = await page.content();
    if (!pageContent.includes('Miauflix') && !pageContent.includes('login')) {
      console.warn('⚠️  Login page may not be properly configured');
    } else {
      console.log('✅ Login page is accessible');
    }

    // Check API endpoints are responding
    console.log('🔍 Testing API endpoint accessibility...');
    try {
      const apiResponse = await page.request.get(`${backendUrl}/api/lists`);
      // We expect this to fail with 401 (unauthorized) rather than 404 or 500
      if (apiResponse.status() === 404) {
        console.warn('⚠️  API endpoints may not be properly configured');
      } else if (apiResponse.status() === 401) {
        console.log('✅ API endpoints are responding (401 unauthorized as expected)');
      } else {
        console.log(`ℹ️ API response status: ${apiResponse.status()}`);
      }
    } catch (error) {
      console.warn('⚠️  API endpoint test failed:', error);
    }

    console.log('✅ Integrated testing environment validation completed successfully');
    console.log('');
    console.log('🎬 Ready to run frontend E2E tests against backend-e2e environment');
  } catch (error) {
    console.error('❌ Integrated environment validation failed:', error);
    console.error('');
    console.error('💡 Make sure the backend-e2e environment is running:');
    console.error('   cd ../backend-e2e && ./scripts/env.sh dev -d');
    console.error('');
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
