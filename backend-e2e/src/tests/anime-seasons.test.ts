import { extractUserCredentialsFromLogs, TestClient, waitForService } from '../utils/test-utils';

/** TMDB keeps Tokyo Revengers in one 63-episode season; AniList has four entries. */
const TOKYO_REVENGERS = '105009';

type Season = { seasonNumber: number; name: string };
type Episode = { episodeNumber: number; title: string };

describe('Anime seasons by AniList entry', () => {
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

  it('numbers a show TMDB keeps in one season by its AniList entries', async () => {
    const show = await client.get(['api', 'shows', ':id'], {
      param: { id: TOKYO_REVENGERS },
      query: { lang: 'en' },
    });
    expect(show).toBeHttpStatus(200);
    const seasons = (show.data as { seasons: Season[] }).seasons.filter(
      season => season.seasonNumber > 0
    );
    expect(seasons.map(season => season.seasonNumber)).toEqual([1, 2, 3, 4]);
    expect(seasons[0]!.name).toBe('Season 1');
    // Later seasons are named after their entry, without the show's title.
    for (const season of seasons.slice(1)) {
      expect(season.name).not.toMatch(/^Season \d+$/);
      expect(season.name).not.toMatch(/^Tokyo Revengers/i);
    }

    // The typed client stops at three path levels.
    const get = client.get.bind(client) as unknown as (
      endpoint: string[],
      args: { param: Record<string, string> }
    ) => Promise<{ status: number; data: { episodes: Episode[] } }>;
    let total = 0;
    for (const season of seasons) {
      const response = await get(['api', 'shows', ':id', 'seasons', ':season'], {
        param: { id: TOKYO_REVENGERS, season: String(season.seasonNumber) },
      });
      expect(response).toBeHttpStatus(200);
      const episodes = response.data.episodes;
      expect(episodes.length).toBeGreaterThan(0);
      // Episodes restart at 1 in every season.
      expect(episodes.map(episode => episode.episodeNumber)).toEqual(
        episodes.map((_, index) => index + 1)
      );
      total += episodes.length;
    }
    // Every episode TMDB lists is in exactly one season.
    expect(total).toBe(63);
  }, 120000);
});
