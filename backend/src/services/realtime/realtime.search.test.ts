import type { SearchServerMessage } from '@routes/search.types';
import type { SearchService } from '@services/search/search.service';

import { RealtimeSearchChannel, type SearchClient } from './realtime.search';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

const flush = () => new Promise(resolve => setImmediate(resolve));

const resultPage = (title: string) => ({
  page: 1,
  totalPages: 1,
  totalResults: 1,
  results: [
    {
      _type: 'movie' as const,
      mediaId: 1,
      title,
      overview: '',
      poster: '',
      backdrop: '',
      releaseDate: '2021-01-01',
      rating: 8,
    },
  ],
});

const setupTest = () => {
  const search = {
    run: jest
      .fn()
      .mockImplementation(async (input: { query?: string }) => resultPage(input.query ?? 'genre')),
    enrich: jest.fn().mockResolvedValue([{ _type: 'movie', mediaId: 1, runtime: 120 }]),
    listRecents: jest.fn().mockResolvedValue([]),
    listGenres: jest.fn().mockResolvedValue([{ key: '18', name: 'Drama' }]),
    recordRecent: jest.fn().mockResolvedValue(undefined),
    removeRecent: jest.fn().mockResolvedValue(undefined),
  };
  let now = 0;
  const channel = new RealtimeSearchChannel(search as unknown as SearchService, () => now);
  const sent: SearchServerMessage[] = [];
  const client: SearchClient = { userId: 'user', send: message => sent.push(message) };
  return {
    channel,
    search,
    client,
    sent,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe('RealtimeSearchChannel', () => {
  it('sends results first and enriched details after', async () => {
    const { channel, client, sent } = setupTest();

    expect(channel.handle(client, { type: 'search', requestId: 1, query: 'Dune', page: 1 })).toBe(
      true
    );
    await flush();

    expect(sent.map(message => message.type)).toEqual(['search-results', 'search-details']);
    expect(sent[0]).toMatchObject({ requestId: 1, results: [{ title: 'Dune' }] });
    expect(sent[1]).toMatchObject({ requestId: 1, items: [{ runtime: 120 }] });
  });

  it('drops responses for a search that was replaced while loading', async () => {
    const { channel, search, client, sent } = setupTest();
    const slow = deferred<ReturnType<typeof resultPage>>();
    search.run.mockImplementationOnce(() => slow.promise);

    channel.handle(client, { type: 'search', requestId: 1, query: 'Du', page: 1 });
    channel.handle(client, { type: 'search', requestId: 2, query: 'Dune', page: 1 });
    await flush();
    slow.resolve(resultPage('Du'));
    await flush();

    expect(sent.filter(message => message.type === 'search-results')).toEqual([
      expect.objectContaining({ requestId: 2 }),
    ]);
  });

  it('keeps delivering earlier pages of the same search', async () => {
    const { channel, client, sent } = setupTest();

    channel.handle(client, { type: 'search', requestId: 1, query: 'Dune', page: 1 });
    channel.handle(client, { type: 'search', requestId: 2, query: 'dune', page: 2 });
    await flush();

    expect(
      sent.filter(message => message.type === 'search-results').map(message => message.requestId)
    ).toEqual([1, 2]);
  });

  it('records committed searches and pushes the updated recents', async () => {
    const { channel, search, client, sent } = setupTest();

    channel.handle(client, { type: 'search', requestId: 1, genre: '18', page: 1, commit: true });
    await flush();

    expect(search.run).toHaveBeenCalledWith({ genre: '18', page: 1, language: 'en' });
    expect(search.recordRecent).toHaveBeenCalledWith('user', 'genre', '18');
    expect(sent.some(message => message.type === 'search-recents')).toBe(true);
  });

  it('sends the genre chips on request', async () => {
    const { channel, client, sent } = setupTest();

    channel.handle(client, { type: 'search-genres' });
    await flush();

    expect(sent).toEqual([{ type: 'search-genres', items: [{ key: '18', name: 'Drama' }] }]);
  });

  it('accepts the anime shortcut as a genre', async () => {
    const { channel, client, search } = setupTest();
    expect(channel.handle(client, { type: 'search', requestId: 1, genre: 'anime', page: 1 })).toBe(
      true
    );
    await flush();
    expect(search.run).toHaveBeenCalledWith({ genre: 'anime', page: 1, language: 'en' });
  });

  it('adds recents without running a search', async () => {
    const { channel, search, client, sent } = setupTest();

    channel.handle(client, { type: 'search-recent-add', kind: 'query', query: 'Dune' });
    await flush();

    expect(search.recordRecent).toHaveBeenCalledWith('user', 'query', 'Dune');
    expect(search.run).not.toHaveBeenCalled();
    expect(sent.map(message => message.type)).toEqual(['search-recents']);
  });

  it('lists and removes recents', async () => {
    const { channel, search, client, sent } = setupTest();

    channel.handle(client, { type: 'search-recents' });
    channel.handle(client, { type: 'search-recent-remove', kind: 'query', query: 'Dune' });
    await flush();

    expect(search.removeRecent).toHaveBeenCalledWith('user', 'query', 'Dune');
    expect(sent.filter(message => message.type === 'search-recents')).toHaveLength(2);
  });

  it.each([
    { type: 'search', requestId: 1, page: 1 },
    { type: 'search', requestId: 1, page: 1, query: 'Dune', genre: '18' },
    { type: 'search', requestId: 1, page: 1, query: '   ' },
    { type: 'search', requestId: 1, page: 1, genre: 'western' },
    { type: 'search', requestId: 1, page: 1, genre: '0' },
    { type: 'search', requestId: 1, page: 0, query: 'Dune' },
    { type: 'search', requestId: 1, page: 1, query: 'Dune', language: '../en' },
    { type: 'search-recent-remove', kind: 'person', query: 'Dune' },
    { type: 'search-recent-add', kind: 'genre', query: 'western' },
  ])('rejects malformed message %#', message => {
    const { channel, client, search } = setupTest();
    expect(channel.handle(client, message)).toBe(false);
    expect(search.run).not.toHaveBeenCalled();
  });

  it('rate limits bursts per client', async () => {
    const { channel, client, sent, advance } = setupTest();

    for (let requestId = 1; requestId <= 11; requestId++) {
      channel.handle(client, { type: 'search', requestId, query: `q${requestId}`, page: 1 });
    }
    expect(sent).toContainEqual({ type: 'search-error', requestId: 11, message: 'rate-limited' });

    advance(1_000);
    sent.length = 0;
    channel.handle(client, { type: 'search', requestId: 12, query: 'Dune', page: 1 });
    await flush();
    expect(sent.map(message => message.type)).toContain('search-results');
  });

  it('reports a failed search', async () => {
    const { channel, search, client, sent } = setupTest();
    search.run.mockRejectedValueOnce(new Error('catalog down'));

    channel.handle(client, { type: 'search', requestId: 3, query: 'Dune', page: 1 });
    await flush();

    expect(sent).toEqual([{ type: 'search-error', requestId: 3, message: 'search-failed' }]);
  });
});
