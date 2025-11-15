#!/usr/bin/env node

/**
 * Display trace logs for failed request IDs collected during test execution
 * Usage: node display-failed-logs.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(__filename);
const backendE2eDir = path.dirname(scriptDir);
const failedRequestsFile = path.join(backendE2eDir, 'failed-requests.json');
const tracesDir = path.join(backendE2eDir, 'logs', 'traces');

// Check if failed requests file exists
if (!fs.existsSync(failedRequestsFile)) {
  // No failed requests to display - silently exit
  process.exit(0);
}

// Check if file is readable
try {
  fs.accessSync(failedRequestsFile, fs.constants.R_OK);
} catch (error) {
  console.error('⚠️  Cannot read failed-requests.json');
  process.exit(0);
}

// Parse JSON and display logs
try {
  const content = fs.readFileSync(failedRequestsFile, 'utf-8');
  const failedRequests = JSON.parse(content);

  if (!failedRequests || Object.keys(failedRequests).length === 0) {
    // Empty file - no failed requests
    process.exit(0);
  }

  let hasAnyLogs = false;

  for (const [testName, requestIds] of Object.entries(failedRequests)) {
    if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
      continue;
    }

    console.log(`\n--- Failed test: ${testName} ---`);
    hasAnyLogs = true;

    for (const requestId of requestIds) {
      const traceFile = path.join(tracesDir, `${requestId}.log`);

      if (fs.existsSync(traceFile)) {
        try {
          const stats = fs.statSync(traceFile);
          if (stats.isFile()) {
            console.log(`\n📄 Trace log: ${traceFile}`);
            console.log('─'.repeat(80));
            const traceContent = fs.readFileSync(traceFile, 'utf-8');
            console.log(traceContent);
            console.log('─'.repeat(80));
          }
        } catch (error) {
          console.error(`⚠️  Error reading trace file: ${error.message}`);
        }
      } else {
        console.log(`\n⚠️  Trace log not found: ${traceFile}`);
      }
    }
  }

  if (!hasAnyLogs) {
    process.exit(0);
  }
} catch (error) {
  if (error instanceof SyntaxError) {
    console.error('⚠️  Invalid JSON in failed-requests.json');
  } else {
    console.error(`⚠️  Error processing failed requests: ${error.message}`);
  }
  process.exit(0);
}

// Exit successfully
process.exit(0);
