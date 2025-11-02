/**
 * Utility to collect and manage failed request IDs during test execution
 * Stores test name -> request IDs mapping for later trace log display
 */

import * as fs from 'fs';
import * as path from 'path';

interface FailedRequests {
  [testName: string]: string[];
}

const FAILED_REQUESTS_FILE = path.join(__dirname, '../../failed-requests.json');

/**
 * Record a failed request ID for a specific test
 */
export function recordFailedRequest(testName: string, requestId: string): void {
  try {
    const data = getFailedRequests();

    if (!data[testName]) {
      data[testName] = [];
    }

    // Avoid duplicates
    if (!data[testName].includes(requestId)) {
      data[testName].push(requestId);
    }

    // Write atomically
    fs.writeFileSync(FAILED_REQUESTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    // Silently fail - don't break tests if file writing fails
    console.warn(`Failed to record request ID ${requestId} for test ${testName}:`, error);
  }
}

/**
 * Get all collected failed requests
 */
export function getFailedRequests(): FailedRequests {
  try {
    if (fs.existsSync(FAILED_REQUESTS_FILE)) {
      const content = fs.readFileSync(FAILED_REQUESTS_FILE, 'utf-8');
      return JSON.parse(content) as FailedRequests;
    }
  } catch (error) {
    // If file is corrupted or unreadable, return empty object
    console.warn('Failed to read failed-requests.json:', error);
  }

  return {};
}

/**
 * Clear all collected failed requests
 * Should be called at the start of each test run
 */
export function clearFailedRequests(): void {
  try {
    if (fs.existsSync(FAILED_REQUESTS_FILE)) {
      fs.unlinkSync(FAILED_REQUESTS_FILE);
    }
  } catch (error) {
    // Silently fail - don't break tests if file deletion fails
    console.warn('Failed to clear failed-requests.json:', error);
  }
}
