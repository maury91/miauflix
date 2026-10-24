import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { fixtureMovie, installOfflineHarness } from './utils/details-harness';
import { waitForHomeReady } from './utils/login';

/** Opt-in timing lane. API fixtures isolate UI work; live playback has its own explicit switch. */
test('intro, ten row moves, and cached movie/show details', async ({ page }, testInfo) => {
  test.skip(
    Boolean(process.env['SMOOTH_LIVE_DETAILS_URL']),
    'Live playback uses authenticated storage instead of the offline login harness'
  );
  const requests: Array<{ path: string; status: number; at: number }> = [];
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/api/'))
      requests.push({ path, status: response.status(), at: Date.now() });
  });
  await page.routeWebSocket('**/api/realtime', socket => socket.close());
  await installOfflineHarness(page);
  const categories = Array.from({ length: 12 }, (_, i) => ({
    name: `Row ${i}`,
    slug: `row-${i}`,
    description: '',
    url: `/list/row-${i}`,
  }));
  const show = {
    ...fixtureMovie,
    _type: 'tvshow',
    mediaId: 42,
    id: 42,
    name: 'Fixture Show',
    title: 'Fixture Show',
    type: 'show',
    firstAirDate: '2025-01-01',
    seasons: [{ id: 1, seasonNumber: 1, name: 'Season 1', episodeCount: 1 }],
  };
  const season = {
    id: 1,
    showId: 42,
    seasonNumber: 1,
    name: 'Season 1',
    episodes: [
      {
        id: 1001,
        episodeNumber: 1,
        title: 'First episode',
        still: fixtureMovie.backdrop,
        overview: 'An episode',
        runtime: 25,
      },
    ],
  };
  await page.route('**/api/lists', route => route.fulfill({ json: categories }));
  await page.route('**/api/list/row-*', route =>
    route.fulfill({
      json: { results: [fixtureMovie, show], total: 2, page: 0, pageSize: 20, totalPages: 1 },
    })
  );
  await page.route(/\/api\/shows\/42(?:\?.*)?$/, route => route.fulfill({ json: show }));
  await page.route('**/api/shows/42/seasons/1', route => route.fulfill({ json: season }));
  await page.route('**/api/media/tv/42/backdrop-focus', route =>
    route.fulfill({ json: { backdropFocus: null } })
  );
  await page.route('**/api/ratings?*', route => {
    const query = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        mediaType: query.get('mediaType'),
        mediaId: Number(query.get('mediaId')),
        rating: null,
      },
    });
  });
  await page.addInitScript(() => {
    const metrics = {
      frames: [] as Array<{ at: number; duration: number }>,
      tasks: [] as Array<{ at: number; duration: number }>,
    };
    Object.assign(window, { smoothMetrics: metrics });
    window.addEventListener('miauflix:intro:animation:start', () =>
      Object.assign(metrics, { animationStart: performance.now() })
    );
    window.addEventListener('miauflix:intro:animation:complete', () =>
      Object.assign(metrics, { animationEnd: performance.now() })
    );
    let previous = performance.now();
    const frame = (now: number) => {
      metrics.frames.push({ at: now, duration: now - previous });
      previous = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    new PerformanceObserver(list => {
      for (const entry of list.getEntries())
        metrics.tasks.push({ at: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  });
  await page.goto('/');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('testpassword123');
  const loginResponse = page.waitForResponse(response =>
    response.url().includes('/api/auth/login')
  );
  await page.getByRole('button', { name: 'Continue' }).click();
  await loginResponse;
  const introStart = await page.evaluate(() => performance.now());
  await waitForHomeReady(page);
  await page.mouse.move(1279, 1);
  const introEnd = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: fixtureMovie.title, exact: true }).first().focus();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('ArrowDown');
    await expect(
      page
        .getByRole('region', { name: `Row ${i + 1}`, exact: true })
        .getByRole('button', { name: fixtureMovie.title, exact: true })
    ).toBeFocused({ timeout: 15000 });
    await page.waitForTimeout(180);
  }
  const rowsEnd = await page.evaluate(() => performance.now());
  const details: Array<{
    kind: string;
    milliseconds: number;
    visibleAfterMs: number;
    seasonRequestsAfterEnter: number;
  }> = [];
  for (const kind of ['movie', 'show']) {
    if (kind === 'show') await page.keyboard.press('ArrowRight');
    const card = page.locator('button[aria-current="true"]');
    await expect(card).toHaveAttribute(
      'aria-label',
      kind === 'movie' ? fixtureMovie.title : 'Fixture Show'
    );
    await expect(card).toBeFocused();
    await expect
      .poll(() =>
        requests.some(
          request => request.path === (kind === 'movie' ? '/api/movies/83533' : '/api/shows/42')
        )
      )
      .toBe(true);
    if (kind === 'show')
      await expect
        .poll(() => requests.some(request => request.path.endsWith('/seasons/1')))
        .toBe(true);
    await page.evaluate(kind => {
      Object.assign(window, { firstDetailsFrame: null });
      document.addEventListener(
        'keydown',
        event => {
          if (event.key !== 'Enter') return;
          const enteredAt = performance.now();
          requestAnimationFrame(() => {
            Object.assign(window, {
              firstDetailsFrame: {
                milliseconds: performance.now() - enteredAt,
                content:
                  kind === 'show'
                    ? document.body.textContent?.includes('First episode')
                    : [...document.querySelectorAll('button')].some(button =>
                        button.textContent?.includes('Watch Now')
                      ),
                loading: document.body.textContent?.includes('Loading more episodes'),
              },
            });
          });
        },
        { once: true, capture: true }
      );
    }, kind);
    const enter = Date.now();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('main', {
        name: `${kind === 'movie' ? fixtureMovie.title : 'Fixture Show'} details`,
      })
    ).toBeVisible();
    if (kind === 'show')
      await expect(page.getByRole('button', { name: /First episode/ })).toBeVisible();
    else
      await expect(page.getByRole('button', { name: 'Watch Now', exact: true })).toBeInViewport();
    await page.waitForFunction(() =>
      Boolean((window as unknown as { firstDetailsFrame: unknown }).firstDetailsFrame)
    );
    const firstFrame = await page.evaluate(
      () =>
        (
          window as unknown as {
            firstDetailsFrame: { content: boolean; loading: boolean; milliseconds: number };
          }
        ).firstDetailsFrame
    );
    expect(firstFrame.content, `${kind} content in first animation frame`).toBe(true);
    expect(firstFrame.loading).toBe(false);
    details.push({
      kind,
      milliseconds: firstFrame.milliseconds,
      visibleAfterMs: Date.now() - enter,
      seasonRequestsAfterEnter: requests.filter(
        request => request.at >= enter && /\/seasons\//.test(request.path)
      ).length,
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('button[aria-current="true"]')).toBeFocused();
    await page.waitForTimeout(200);
  }
  const metrics = await page.evaluate(
    ({ introStart, introEnd, rowsEnd }) => {
      const metrics = (
        window as unknown as {
          smoothMetrics: {
            frames: Array<{ at: number; duration: number }>;
            tasks: Array<{ at: number; duration: number }>;
            animationStart?: number;
            animationEnd?: number;
          };
        }
      ).smoothMetrics;
      const summarize = (start: number, end: number) => ({
        maxFrameMs: Math.max(
          0,
          ...metrics.frames
            .filter(frame => frame.at >= start && frame.at <= end)
            .map(frame => frame.duration)
        ),
        longFrames: metrics.frames.filter(
          frame => frame.at >= start && frame.at <= end && frame.duration > 50
        ).length,
        longTasks: metrics.tasks.filter(task => task.at >= start && task.at <= end),
      });
      return {
        intro: summarize(introStart, introEnd),
        animation: summarize(
          metrics.animationStart ?? introStart,
          metrics.animationEnd ?? introEnd
        ),
        animationObserved:
          metrics.animationStart !== undefined && metrics.animationEnd !== undefined,
        rows: summarize(introEnd, rowsEnd),
      };
    },
    { introStart, introEnd, rowsEnd }
  );
  const report = {
    build: process.env['SMOOTH_BUILD'] ?? 'development',
    ...metrics,
    details,
    requests,
  };
  await writeFile(testInfo.outputPath('smooth-core-flows.json'), JSON.stringify(report, null, 2));
  await testInfo.attach('smooth-core-flows.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  console.log(
    JSON.stringify({
      ...report,
      requests: undefined,
      apiRequests: requests.length,
      rateLimitedEndpoints: requests.filter(request => request.status === 429),
    })
  );
  expect(requests.filter(request => request.status === 429)).toEqual([]);
  expect(details.find(detail => detail.kind === 'show')?.seasonRequestsAfterEnter).toBe(0);
  if (
    process.env['SMOOTH_STRICT_TIMING'] === 'true' ||
    process.env['SMOOTH_BUILD'] === 'production'
  ) {
    expect(metrics.animationObserved).toBe(true);
    expect(metrics.animation.maxFrameMs).toBeLessThanOrEqual(50);
    expect(metrics.rows.maxFrameMs).toBeLessThanOrEqual(50);
  }
});

test('live Watch to first frame after three second details dwell', async ({ page }, testInfo) => {
  test.skip(
    !process.env['SMOOTH_LIVE_DETAILS_URL'],
    'Requires an explicitly configured live backend and authenticated browser storage'
  );
  await page.goto(process.env['SMOOTH_LIVE_DETAILS_URL']!);
  await page.waitForTimeout(3000);
  const start = Date.now();
  await page.getByRole('button', { name: /Watch Now|Resume Watching/ }).click();
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    return video && video.currentTime > 0 && video.readyState >= 2;
  });
  const milliseconds = Date.now() - start;
  await testInfo.attach('playback-timing.json', {
    body: JSON.stringify({ milliseconds }),
    contentType: 'application/json',
  });
  expect(milliseconds).toBeLessThan(3000);
});
