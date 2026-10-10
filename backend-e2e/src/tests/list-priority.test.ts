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
  const promotion = await client.post(['api', 'list', 'priorities'], {
    json: {
      items: [{ mediaType: 'movie', mediaId: promoted, tier: 'viewport' }],
    },
  });
  expect(promotion).toBeHttpStatus(200);
  expect(promotion.data).toEqual({ accepted: 1 });
  return true;
}

const describeWithWorkers =
  process.env['BACKGROUND_TASKS_ENABLED'] === 'true' ? describe : describe.skip;

describeWithWorkers('List priority with background workers enabled', () => {
  it('accepts a viewport promotion for a prefetched movie', async () => {
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

  it('accepts promotions for media in later lists', async () => {
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
