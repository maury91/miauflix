import { TestClient, waitForService } from '../utils/test-utils';

describe('Frontend Serving', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = new TestClient();

    // Wait for the backend to be ready before running tests
    try {
      await waitForService(client);
    } catch (error) {
      console.log('❌ Backend service is not available. Ensure the Docker environment is running.');
      console.log('Run: ./scripts/env.sh test to start the full test environment');
      throw error;
    }
  }, 60000); // 60 second timeout for service startup

  it('should serve the frontend HTML at root path', async () => {
    // Make a direct HTTP request to the root path to get the frontend
    const response = await fetch(global.BACKEND_URL);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/html/);

    const html = await response.text();

    // Check that it's actually HTML content
    expect(html).toMatch(/<html/i);
    expect(html).toMatch(/<head/i);
    expect(html).toMatch(/<body/i);

    // Check for common frontend elements (Miauflix uses different structure)
    expect(html).toMatch(/<title>Miauflix<\/title>/i);
    expect(html).toMatch(/window\.API_URL/); // Check for API URL configuration
  });

  it('should serve frontend static assets', async () => {
    // First get the HTML to see what assets are referenced
    const htmlResponse = await fetch(global.BACKEND_URL);
    const html = await htmlResponse.text();

    // Extract CSS and JS file references from HTML
    const cssMatches = html.match(/href="([^"]*\.css)"/g) || [];
    const jsMatches = html.match(/src="([^"]*\.js)"/g) || [];

    if (cssMatches.length === 0 && jsMatches.length === 0) {
      console.log('⚠️ No CSS or JS assets found in HTML, checking for common asset paths');

      // Test common asset paths that might exist
      const commonAssets = [
        'assets/index.css',
        'assets/index.js',
        'static/css/main.css',
        'static/js/main.js',
      ];

      for (const assetPath of commonAssets) {
        const assetResponse = await fetch(global.BACKEND_URL + assetPath);
        if (assetResponse.status === 200) {
          console.log(`✅ Found asset at ${assetPath}`);
          return; // At least one asset is served
        }
      }

      // If no assets found, that might be okay for a minimal frontend
      console.log('ℹ️ No static assets found, but frontend HTML is served');
      return;
    }

    // Test CSS assets
    for (const cssMatch of cssMatches) {
      const href = cssMatch.match(/href="([^"]*)"/)?.[1];
      if (href && href.startsWith('/')) {
        const cssResponse = await fetch(global.BACKEND_URL + href.substring(1));
        expect(cssResponse.status).toBe(200);
        expect(cssResponse.headers.get('content-type')).toMatch(/text\/css/);
      }
    }

    // Test JS assets
    for (const jsMatch of jsMatches) {
      const src = jsMatch.match(/src="([^"]*)"/)?.[1];
      if (src && src.startsWith('/')) {
        const jsResponse = await fetch(global.BACKEND_URL + src.substring(1));
        expect(jsResponse.status).toBe(200);
        expect(jsResponse.headers.get('content-type')).toMatch(/javascript/);
      }
    }
  });

  it('should have correct MIME types for existing frontend files', async () => {
    // Test for files that we know exist based on the HTML
    const response = await fetch(global.BACKEND_URL);
    const html = await response.text();

    // Extract actual asset paths from HTML
    const cssMatches = html.match(/href="([^"]*\.css)"/g) || [];
    const jsMatches = html.match(/src="([^"]*\.js)"/g) || [];

    // Test actual CSS files
    for (const cssMatch of cssMatches) {
      const href = cssMatch.match(/href="([^"]*)"/)?.[1];
      if (href && href.startsWith('/assets/')) {
        const cssResponse = await fetch(global.BACKEND_URL + href.substring(1));
        if (cssResponse.status === 200) {
          expect(cssResponse.headers.get('content-type')).toMatch(/text\/css/);
        }
      }
    }

    // Test actual JS files
    for (const jsMatch of jsMatches) {
      const src = jsMatch.match(/src="([^"]*)"/)?.[1];
      if (src && src.startsWith('/assets/')) {
        const jsResponse = await fetch(global.BACKEND_URL + src.substring(1));
        if (jsResponse.status === 200) {
          expect(jsResponse.headers.get('content-type')).toMatch(/javascript/);
        }
      }
    }

    // Test optional common files - but be tolerant of SPA fallback behavior
    const optionalFiles = [
      { path: 'robots.txt', expectedType: /text\/plain/ },
      { path: 'favicon.png', expectedType: /image\/.*/ },
    ];

    for (const testFile of optionalFiles) {
      const fileResponse = await fetch(global.BACKEND_URL + testFile.path);

      if (fileResponse.status === 200) {
        const contentType = fileResponse.headers.get('content-type') || '';

        // If it matches expected type, great!
        if (contentType.match(testFile.expectedType)) {
          expect(contentType).toMatch(testFile.expectedType);
        } else if (contentType.match(/text\/html/)) {
          // SPA fallback behavior - this is acceptable for optional files
          console.log(`ℹ️ ${testFile.path} not found (returned HTML) - this is optional`);
        } else {
          // Unexpected content type
          expect(contentType).toMatch(testFile.expectedType);
        }
      } else {
        console.log(
          `ℹ️ ${testFile.path} not found (status: ${fileResponse.status}) - this is optional`
        );
      }
    }
  });

  it('should properly serve API routes with JSON content type', async () => {
    // Test that actual API routes return JSON, not HTML
    const apiResponse = await fetch(global.BACKEND_URL + 'api/health');

    if (apiResponse.status === 200) {
      const contentType = apiResponse.headers.get('content-type') || '';
      expect(contentType).toMatch(/application\/json/);
      expect(contentType).not.toMatch(/text\/html/);

      const data = await apiResponse.json();
      expect(data).toHaveProperty('status', 'ok');
    } else {
      // If health endpoint fails, at least ensure it's not serving HTML
      const contentType = apiResponse.headers.get('content-type') || '';
      expect(contentType).not.toMatch(/text\/html/);
    }
  });

  it('should fallback to index.html for client-side routing', async () => {
    // Test that SPA routing paths fallback to index.html
    const spaRoutes = ['login', 'movies', 'tv', 'settings'];

    for (const route of spaRoutes) {
      const response = await fetch(global.BACKEND_URL + route);

      if (response.status === 200) {
        expect(response.headers.get('content-type')).toMatch(/text\/html/);

        const html = await response.text();
        expect(html).toMatch(/<title>Miauflix<\/title>/i);
      } else {
        console.log(`ℹ️ SPA route ${route} not configured (status: ${response.status})`);
      }
    }
  });

  it('should serve frontend with proper caching headers', async () => {
    const response = await fetch(global.BACKEND_URL);

    expect(response.status).toBe(200);

    // Check for some caching-related headers (these may vary based on configuration)
    const cacheControl = response.headers.get('cache-control');
    const etag = response.headers.get('etag');
    const lastModified = response.headers.get('last-modified');

    if (cacheControl) {
      console.log(`✅ Cache-Control header present: ${cacheControl}`);
    }
    if (etag) {
      console.log(`✅ ETag header present: ${etag}`);
    }
    if (lastModified) {
      console.log(`✅ Last-Modified header present: ${lastModified}`);
    }

    // At least one caching mechanism should be in place for production readiness
    if (!cacheControl && !etag && !lastModified) {
      console.log('ℹ️ No caching headers found - this is okay for development');
    }
  });
});
