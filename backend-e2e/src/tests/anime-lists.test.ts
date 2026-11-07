import { extractUserCredentialsFromLogs, TestClient, waitForService } from '../utils/test-utils';

type Media = { _type?: string; mediaId?: number };

const ANIME_LISTS = ['anilist-season-popular', 'anilist-trending', 'anilist-all-time-popular'];

describe('AniList anime lists', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = new TestClient();
    await waitForService(client);
    const credentials = await extractUserCredentialsFromLogs();
    if (!credentials) {
      throw new Error(
        'No user credentials available for testing - ensure the backend E2E environment generated an admin user'
      );
    }
    await client.login(credentials);
  });

  it('lists the anime rows without a linked account', async () => {
    const response = await client.get(['api', 'lists']);
    expect(response).toBeHttpStatus(200);
    const slugs = (response.data.results as { slug?: string }[]).map(list => list.slug);
    expect(slugs).toEqual(expect.arrayContaining(ANIME_LISTS));
  });

  it.each(ANIME_LISTS)(
    'serves %s as TMDB media',
    async slug => {
      const response = await client.get(['api', 'list', ':slug'], {
        param: { slug },
        query: { lang: 'en', page: '0', limit: '20' },
      });
      expect(response).toBeHttpStatus(200);
      const results = response.data.results as Media[];
      expect(results.length).toBeGreaterThan(0);
      for (const media of results) {
        expect(['movie', 'tvshow']).toContain(media._type);
        expect(typeof media.mediaId).toBe('number');
      }
      // Several cours of one show become one TMDB show.
      const keys = results.map(media => `${media._type}:${media.mediaId}`);
      expect(new Set(keys).size).toBe(keys.length);
    },
    60000
  );
});
