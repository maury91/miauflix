import lighthouse from 'lighthouse';

import { expect, test } from './fixtures';
import { CDP_PORT_MAP, DEFAULT_CDP_PORT } from './test-constants';

/**
 * Lighthouse performance audit for the intro animation route.
 * This test measures current Lighthouse scores without enforcing thresholds.
 * Scores are output to the console for monitoring purposes.
 *
 * Note: This test only runs on chromium-desktop project which has remote debugging enabled.
 * To run only this test: npx playwright test --config=playwright.config.e2e.ts --project=chromium-desktop lighthouse
 */
test.describe('Lighthouse Audit', () => {
  test('should measure Lighthouse scores for intro animation route', async ({
    page,
    browserName,
  }, testInfo) => {
    // Lighthouse only works with Chromium
    test.skip(browserName !== 'chromium', 'Lighthouse only works with Chromium');

    // Increase timeout for Lighthouse audit (can take 60-90 seconds)
    test.setTimeout(120000);

    // Navigate to root route (intro animation)
    await page.goto('/');

    // Determine CDP port based on project name from Playwright configuration
    const projectName = testInfo.project.name;
    let port = CDP_PORT_MAP[projectName];

    if (!port) {
      console.warn(
        `Unknown project "${projectName}", falling back to default port ${DEFAULT_CDP_PORT}`
      );
      port = DEFAULT_CDP_PORT;
    }

    // Get the page URL for Lighthouse
    const url = page.url();

    // Run Lighthouse audit using the existing browser connection
    const runnerResult = await lighthouse(url, {
      port,
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      logLevel: 'silent', // Suppress verbose Lighthouse output
      output: 'json', // Only output JSON (no HTML/CSV)
    });

    if (!runnerResult) {
      throw new Error(
        `Lighthouse audit failed for ${url} on port ${port}. ` +
          `Ensure the browser is running with remote debugging enabled.`
      );
    }

    const { lhr } = runnerResult;

    // Extract scores (Lighthouse returns scores as 0-1, convert to 0-100)
    const scores = {
      performance: Math.round((lhr.categories['performance']?.score || 0) * 100),
      accessibility: Math.round((lhr.categories['accessibility']?.score || 0) * 100),
      'best-practices': Math.round((lhr.categories['best-practices']?.score || 0) * 100),
      seo: Math.round((lhr.categories['seo']?.score || 0) * 100),
    };

    // Output scores to console
    console.log('\n=== Lighthouse Scores ===');
    console.log(`Performance: ${scores.performance}/100`);
    console.log(`Accessibility: ${scores.accessibility}/100`);
    console.log(`Best Practices: ${scores['best-practices']}/100`);
    console.log(`SEO: ${scores.seo}/100`);
    console.log('========================\n');

    // Assert baseline scores to catch regressions
    expect(scores.performance).toBeGreaterThanOrEqual(50); // Minimum 50% performance
    expect(scores.accessibility).toBeGreaterThanOrEqual(80); // Minimum 80% accessibility
    expect(scores['best-practices']).toBeGreaterThanOrEqual(70); // Minimum 70% best practices
    expect(scores.seo).toBeGreaterThanOrEqual(80); // Minimum 80% SEO

    // Log detailed performance metrics
    const metrics = lhr.audits;
    console.log('=== Performance Metrics ===');
    if (metrics['first-contentful-paint']) {
      console.log(`First Contentful Paint: ${metrics['first-contentful-paint'].displayValue}`);
    }
    if (metrics['largest-contentful-paint']) {
      console.log(`Largest Contentful Paint: ${metrics['largest-contentful-paint'].displayValue}`);
    }
    if (metrics['total-blocking-time']) {
      console.log(`Total Blocking Time: ${metrics['total-blocking-time'].displayValue}`);
    }
    if (metrics['cumulative-layout-shift']) {
      console.log(`Cumulative Layout Shift: ${metrics['cumulative-layout-shift'].displayValue}`);
    }
    if (metrics['speed-index']) {
      console.log(`Speed Index: ${metrics['speed-index'].displayValue}`);
    }
    if (metrics['interactive']) {
      console.log(`Time to Interactive: ${metrics['interactive'].displayValue}`);
    }
    console.log('==========================\n');

    // Log opportunities for improvement
    console.log('=== Opportunities (with estimated savings) ===');
    const opportunities = Object.values(lhr.audits).filter(
      audit => audit.details?.type === 'opportunity' && audit.score !== null && audit.score < 1
    );

    if (opportunities.length > 0) {
      opportunities
        .sort((a, b) => {
          const aMetric = a.metricSavings?.['LCP'] || 0;
          const bMetric = b.metricSavings?.['LCP'] || 0;
          return bMetric - aMetric;
        })
        .forEach(audit => {
          console.log(`\n• ${audit.title}`);
          console.log(`  ${audit.description}`);
          if (audit.metricSavings) {
            Object.entries(audit.metricSavings).forEach(([metric, value]) => {
              if (typeof value === 'number' && value > 0) {
                console.log(`  ${metric} savings: ${Math.round(value)}ms`);
              }
            });
          }
        });
    } else {
      console.log('No major opportunities found!');
    }
    console.log('\n===========================================\n');

    // Log diagnostics
    console.log('=== Diagnostics ===');
    const diagnostics = Object.values(lhr.audits).filter(
      audit =>
        (audit.details?.type === 'debugdata' ||
          audit.details?.type === 'table' ||
          audit.details?.type === 'filmstrip') &&
        audit.score !== null &&
        audit.score < 0.9
    );

    if (diagnostics.length > 0) {
      diagnostics.forEach(audit => {
        console.log(`\n• ${audit.title}`);
        if (audit.displayValue) {
          console.log(`  Value: ${audit.displayValue}`);
        }
        if (audit.description) {
          console.log(`  ${audit.description}`);
        }
      });
    } else {
      console.log('All diagnostics passed!');
    }
    console.log('\n===================\n');

    // Log failed audits by category
    console.log('=== Failed/Warning Audits ===');
    ['performance', 'accessibility', 'best-practices', 'seo'].forEach(category => {
      const categoryAudits = lhr.categories[category]?.auditRefs || [];
      const failed = categoryAudits
        .map(ref => lhr.audits[ref.id])
        .filter(audit => audit.score !== null && audit.score < 0.9);

      if (failed.length > 0) {
        console.log(`\n${category.toUpperCase()}:`);
        failed.forEach(audit => {
          const scoreIcon = audit.score === 0 ? '❌' : '⚠️';
          console.log(
            `  ${scoreIcon} ${audit.title} (${Math.round((audit.score || 0) * 100)}/100)`
          );
          if (audit.description) {
            console.log(`     ${audit.description}`);
          }
        });
      }
    });
    console.log('\n=============================\n');
  });
});
