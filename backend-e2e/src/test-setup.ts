/**
 * Global test setup for backend E2E tests
 */

// Set test timeout to 30 seconds for integration tests
jest.setTimeout(30000);

// Global test configuration
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}/`;

// Make backend URL available globally
global.BACKEND_URL = BACKEND_URL;

// Import custom matchers
import { toBeHttpStatus, toHaveRequestId } from './utils/request-id-matcher';

// Add custom matchers
expect.extend({
  toBeHttpStatus,
  toHaveRequestId,
});

declare global {
  var BACKEND_URL: string;

  namespace jest {
    interface Matchers<R> {
      toBeHttpStatus(expected: number): R;
      toHaveRequestId(): R;
    }
  }
}

export {};
