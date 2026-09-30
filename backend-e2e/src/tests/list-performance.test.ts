import { performance } from 'node:perf_hooks';

import { extractUserCredentialsFromLogs, TestClient, waitForService } from '../utils/test-utils';

type ListDefinition = {
  slug: string;
};

type ListPageResponse = {
  results: unknown[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

describe('List performance', () => {
  it('loads one cold paginated list in under one second', async () => {
    const client = new TestClient();
    await waitForService(client);

    const credentials = await extractUserCredentialsFromLogs();
    if (!credentials) {
      throw new Error(
        'No user credentials available for testing - ensure the backend E2E environment generated an admin user'
      );
    }
    await client.login(credentials);

    const listsResponse = await client.get(['api', 'lists']);
    expect(listsResponse).toBeHttpStatus(200);
    expect(Array.isArray(listsResponse.data)).toBe(true);

    const list = (listsResponse.data as ListDefinition[])[0];
    if (!list?.slug) {
      throw new Error('The lists endpoint did not return a list slug to benchmark');
    }

    const startedAt = performance.now();
    const pageResponse = await client.get(['api', 'list', ':slug'], {
      param: { slug: list.slug },
      query: { lang: 'en', page: '0', limit: '20' },
    });
    const durationMs = performance.now() - startedAt;

    expect(pageResponse).toBeHttpStatus(200);
    const page = pageResponse.data as ListPageResponse;
    expect(Array.isArray(page.results)).toBe(true);
    expect(page.page).toBe(0);
    expect(page.pageSize).toBe(20);
    expect(page.total).toBeGreaterThanOrEqual(0);
    expect(page.totalPages).toBeGreaterThanOrEqual(0);
    console.info(`Cold paginated list ${list.slug} loaded in ${durationMs.toFixed(1)}ms`);
    expect(durationMs).toBeLessThan(1000);
  }, 30000);
});
