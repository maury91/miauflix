import { chromium } from '@playwright/test';

/**
 * Global setup for integrated testing through Vite proxy
 * This validates that the Vite preview server is running and correctly proxying API calls
 * to the backend-e2e environment.
 */
async function globalSetup() {
  console.log('🎭 Starting Playwright Global Setup for E2E Testing');

  // URLs for testing
  const frontendUrl = 'http://localhost:4174'; // Vite preview server
  const backendUrl = process.env['API_URL'] || 'http://localhost:3000';
  console.log(`🌐 Frontend URL (Vite): ${frontendUrl}`);
  console.log(`🌐 Backend URL (Proxy Target): ${backendUrl}`);

  // Launch browser for connectivity checks
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Check Vite preview server is serving the frontend
    console.log('🔍 Checking Vite preview server...');
    const frontendResponse = await page.request.get(frontendUrl);

    if (!frontendResponse.ok()) {
      throw new Error(`Vite preview server check failed with status ${frontendResponse.status()}`);
    }

    const contentType = frontendResponse.headers()['content-type'];
    if (!contentType || !contentType.includes('text/html')) {
      throw new Error(`Expected HTML content from Vite, got: ${contentType}`);
    }

    console.log('✅ Vite preview server is serving frontend');

    // Check API proxy is working by testing health endpoint through Vite
    console.log('🔍 Testing API proxy through Vite...');
    const healthResponse = await page.request.get(`${frontendUrl}/api/health`);

    if (!healthResponse.ok()) {
      throw new Error(`API proxy health check failed with status ${healthResponse.status()}`);
    }

    const healthData = await healthResponse.json();
    console.log('✅ API proxy is working, backend health:', healthData);

    // Test navigation to frontend pages through Vite
    console.log('🔍 Testing frontend page navigation...');
    await page.goto(`${frontendUrl}/login`);

    // Wait for basic page structure to load
    await page.waitForSelector('body', { timeout: 10000 });

    // Check if this looks like the login page
    const pageContent = await page.content();
    if (!pageContent.includes('Miauflix') && !pageContent.includes('login')) {
      console.warn('⚠️  Login page may not be properly configured');
    } else {
      console.log('✅ Login page is accessible through Vite');
    }

    // Test API endpoints through Vite proxy
    console.log('🔍 Testing API endpoints through Vite proxy...');
    try {
      const apiResponse = await page.request.get(`${frontendUrl}/api/lists`);
      // We expect this to fail with 401 (unauthorized) rather than 404 or 500
      if (apiResponse.status() === 404) {
        console.warn('⚠️  API endpoints may not be properly proxied');
      } else if (apiResponse.status() === 401) {
        console.log('✅ API endpoints are properly proxied (401 unauthorized as expected)');
      } else {
        console.log(`ℹ️ API response status through proxy: ${apiResponse.status()}`);
      }
    } catch (error) {
      console.warn('⚠️  API endpoint proxy test failed:', error);
    }

    console.log('✅ Vite proxy environment validation completed successfully');
    console.log('');
    console.log('🎬 Ready to run frontend E2E tests through Vite proxy');
  } catch (error) {
    console.error('❌ Vite proxy environment validation failed:', error);
    console.error('');
    console.error('💡 Make sure the backend-e2e environment is running:');
    console.error('   cd ../backend-e2e && ./scripts/env.sh dev -d');
    console.error('💡 And that the Vite preview server will start with API_URL set correctly');
    console.error('');
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
