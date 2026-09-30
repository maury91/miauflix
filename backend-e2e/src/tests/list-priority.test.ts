import { performance } from 'node:perf_hooks';

import { extractUserCredentialsFromLogs, TestClient, waitForService } from '../utils/test-utils';

type ListDefinition = { slug: string };
type Media = { _type?: string; mediaId?: number };

async function assertPromotionForList(client: TestClient, slug: string): Promise<boolean> {
  const pageResponse = await client.get(['api', 'list', ':slug'], {
    param: { slug },
    query: { lang: 'en', page: '0', limit: '20', priority: 'prefetch' },
  });
  if (pageResponse.status !== 200) return false;
  const movies = (pageResponse.data.results as Media[]).filter(
    media => media._type === 'movie' && typeof media.mediaId === 'number'
  );
  if (movies.length < 3) return false;

  const promoted = movies[movies.length - 1].mediaId!;
  const queued = movies.slice(0, -1).map(media => media.mediaId!);
  const promotion = await client.post(['api', 'list', 'priorities'], {
    json: {
      items: [{ mediaType: 'movie', mediaId: promoted, tier: 'viewport' }],
    },
  });
  expect(promotion).toBeHttpStatus(200);
  expect(promotion.data).toEqual({ accepted: 1 });

  const promotedAt = await waitForSources(client, promoted);
  const queuedAt = await Promise.race(queued.map(mediaId => waitForSources(client, mediaId)));
  expect(promotedAt).toBeLessThanOrEqual(queuedAt);
  return true;
}

async function waitForSources(client: TestClient, mediaId: number): Promise<number> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await client.get(['api', 'movies', ':id'], {
      param: { id: String(mediaId) },
      query: { includeSources: 'true' },
    });
    if (response.status === 200 && 'sources' in response.data) {
      const sources = response.data.sources;
      if (Array.isArray(sources) && sources.length > 0) return performance.now();
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for sources for media ${mediaId}`);
}

describe('List priority with background workers enabled', () => {
  it('promotes a newly visible movie ahead of queued prefetch work', async () => {
    const client = new TestClient();
    await waitForService(client);
    const credentials = await extractUserCredentialsFromLogs();
    if (!credentials) throw new Error('No generated E2E admin credentials found');
    await client.login(credentials);

    const listsResponse = await client.get(['api', 'lists']);
    expect(listsResponse).toBeHttpStatus(200);
    const slug = (listsResponse.data as ListDefinition[])[0]?.slug;
    if (!slug) throw new Error('No list available for priority test');

    expect(await assertPromotionForList(client, slug)).toBe(true);
  }, 60000);

  it('promotes media for lists beyond the first list position', async () => {
    const client = new TestClient();
    await waitForService(client);
    const credentials = await extractUserCredentialsFromLogs();
    if (!credentials) throw new Error('No generated E2E admin credentials found');
    await client.login(credentials);

    const listsResponse = await client.get(['api', 'lists']);
    expect(listsResponse).toBeHttpStatus(200);
    const lists = listsResponse.data as ListDefinition[];
    let validNonFirstLists = 0;
    for (const list of lists.slice(1)) {
      if (await assertPromotionForList(client, list.slug)) {
        validNonFirstLists += 1;
        if (validNonFirstLists >= 2) break;
      }
    }
    expect(validNonFirstLists).toBeGreaterThan(0);
  }, 90000);
});
