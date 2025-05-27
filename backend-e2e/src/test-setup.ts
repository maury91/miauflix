/**
 * Global test setup for backend E2E tests
 */

// Set test timeout to 30 seconds for integration tests
jest.setTimeout(30000);

// Global test configuration
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;

// Make backend URL available globally
global.BACKEND_URL = BACKEND_URL;

console.log(`🧪 Running E2E tests against backend at: ${BACKEND_URL}`);

// Global beforeAll setup
beforeAll(async () => {
  console.log('🚀 Starting E2E test suite...');
});

// Global afterAll cleanup
afterAll(async () => {
  console.log('✅ E2E test suite completed');
});

// Add custom matchers if needed
expect.extend({
  toBeHttpStatus(received: number, expected: number) {
    const pass = received === expected;
    if (pass) {
      return {
        message: () => `Expected HTTP status not to be ${expected}`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected HTTP status ${expected} but received ${received}`,
        pass: false,
      };
    }
  },
});

declare global {
  var BACKEND_URL: string;

  namespace jest {
    interface Matchers<R> {
      toBeHttpStatus(expected: number): R;
    }
  }
}

export {};
