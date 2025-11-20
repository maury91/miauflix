/**
 * Custom Jest matcher to display request IDs when tests fail
 * This helps correlate test failures with backend traces
 */

import { recordFailedRequest } from './failed-requests-collector';
import type { TestResponse } from './test-utils';

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeHttpStatus(status: number): R;
      toHaveRequestId(): R;
    }
  }
}

/**
 * Custom matcher to check HTTP status codes with request ID display
 */
export const toBeHttpStatus = (received: TestResponse | number, expectedStatus: number) => {
  // Handle both TestResponse objects and direct status numbers
  const actualStatus =
    typeof received === 'object' && 'status' in received ? received.status : received;

  const pass = actualStatus === expectedStatus;

  if (pass) {
    return {
      message: () => `Expected status not to be ${expectedStatus}`,
      pass: true,
    };
  } else {
    // If we have a TestResponse object, show request ID
    const requestIdInfo =
      typeof received === 'object' && 'requestId' in received && received.requestId
        ? `\n🔍 Request ID: ${received.requestId} (use this to trace in logs/traces)`
        : '\n⚠️  No request ID found in response headers';

    // Collect failed request ID for trace log display
    if (typeof received === 'object' && 'requestId' in received && received.requestId) {
      try {
        const state = expect.getState();
        const testPath = state.testPath || '';
        const testName = state.currentTestName || 'unknown';

        // Format: "filename.test.ts - test description"
        const fileName = testPath.split(/[/\\]/).pop() || 'unknown';
        const formattedTestName = `${fileName} - ${testName}`;

        recordFailedRequest(formattedTestName, received.requestId);
      } catch {
        // Silently fail - don't break tests if collection fails
      }
    }

    return {
      message: () => `Expected status ${expectedStatus} but got ${actualStatus}${requestIdInfo}`,
      pass: false,
    };
  }
};

/**
 * Custom matcher to check if response has a request ID
 */
export const toHaveRequestId = (received: TestResponse) => {
  const pass = typeof received === 'object' && 'requestId' in received && !!received.requestId;

  if (pass) {
    return {
      message: () => `Expected response not to have a request ID`,
      pass: true,
    };
  } else {
    return {
      message: () => `Expected response to have a request ID in X-Trace-ID or X-Request-ID headers`,
      pass: false,
    };
  }
};

/**
 * Utility function to display request ID for any test failure
 * Call this in test catch blocks or after failed assertions
 */
export function displayRequestId(response: TestResponse): void {
  if (response.requestId) {
    console.log(`🔍 Request ID: ${response.requestId}`);
    console.log(`💡 Use this ID to trace the request in logs and trace files`);
  } else {
    console.log(`⚠️  No request ID found in response headers`);
  }
}

/**
 * Enhanced expect function that automatically displays request IDs on failure
 * Usage: expectWithRequestId(response).toBeHttpStatus(200)
 */
export function expectWithRequestId(response: TestResponse) {
  const originalExpect = expect(response);

  // Override the toBe matcher to display request ID on failure
  const enhancedExpect = {
    ...originalExpect,
    toBe: (expected: any) => {
      try {
        return originalExpect.toBe(expected);
      } catch (error) {
        displayRequestId(response);
        throw error;
      }
    },
    toEqual: (expected: any) => {
      try {
        return originalExpect.toEqual(expected);
      } catch (error) {
        displayRequestId(response);
        throw error;
      }
    },
    toHaveProperty: (property: string, value?: any) => {
      try {
        return originalExpect.toHaveProperty(property, value);
      } catch (error) {
        displayRequestId(response);
        throw error;
      }
    },
  };

  return enhancedExpect;
}
