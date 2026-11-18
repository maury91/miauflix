import { configureStore } from '@reduxjs/toolkit';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { batchPost, movieGet, showGet } = vi.hoisted(() => ({
  batchPost: vi.fn(),
  movieGet: vi.fn(),
  showGet: vi.fn(),
}));

vi.mock('@shared/api/backend-client', () => ({
  backendClient: {
    api: {
      media: { batch: { $post: batchPost } },
      movies: { ':id': { $get: movieGet } },
      shows: { ':id': { $get: showGet } },
    },
  },
}));
vi.mock('@store/slices/auth', () => ({ selectCurrentSessionId: () => 'session-1' }));
vi.mock('@features/auth/api/auth.api', () => ({
  authApi: { endpoints: { listSessions: { initiate: vi.fn() } } },
}));

import type { ProgressEntry } from '@miauflix/backend';
import { mediaFromProgress, progressTitle } from '@pages/home/media-mappers';

import { mediaApi, type MediaBatchRef, resetMediaBatchSupport } from './media.api';

const card = ({ mediaType, mediaId }: MediaBatchRef) =>
  mediaType === 'movie'
    ? { _type: 'movie', id: mediaId, mediaId, title: `Movie ${mediaId}` }
    : { _type: 'tvshow', id: mediaId, mediaId, name: `Show ${mediaId}` };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The backend answers with every title asked for except those in `missing`. */
const answerBatches = (missing = new Set<number>()) =>
  batchPost.mockImplementation(async ({ json: { items } }: { json: { items: MediaBatchRef[] } }) =>
    json(200, { results: items.filter(item => !missing.has(item.mediaId)).map(card) })
  );

const setupStore = () =>
  configureStore({
    reducer: { [mediaApi.reducerPath]: mediaApi.reducer },
    middleware: getDefault => getDefault().concat(mediaApi.middleware),
  });

const refs = (count: number): MediaBatchRef[] =>
  Array.from({ length: count }, (_, index) => ({
    mediaType: index % 2 ? 'tv' : 'movie',
    mediaId: 1000 + index,
  }));

const load = async (store: ReturnType<typeof setupStore>, items: MediaBatchRef[]) =>
  Promise.all(items.map(ref => store.dispatch(mediaApi.endpoints.getMediaCard.initiate(ref))));

describe('getMediaCard', () => {
  afterEach(() => {
    batchPost.mockReset();
    movieGet.mockReset();
    showGet.mockReset();
    resetMediaBatchSupport();
  });

  it('loads a long Continue watching row with one request and caches each title on its own', async () => {
    answerBatches();
    const store = setupStore();
    const items = refs(24);

    const results = await load(store, items);

    expect(batchPost).toHaveBeenCalledTimes(1);
    expect(batchPost.mock.calls[0][0].json).toEqual({ items, lang: 'en' });
    expect(results.map(result => result.data)).toEqual(items.map(card));
    for (const ref of items)
      expect(mediaApi.endpoints.getMediaCard.select(ref)(store.getState()).data).toEqual(card(ref));
  });

  it('splits more titles than one batch carries into batch-sized requests, spaced under the rate limit', async () => {
    answerBatches();
    const sentAt: number[] = [];
    const answer = batchPost.getMockImplementation()!;
    batchPost.mockImplementation(request => {
      sentAt.push(Date.now());
      return answer(request);
    });
    const store = setupStore();

    const results = await load(store, refs(120));

    expect(batchPost.mock.calls.map(([request]) => request.json.items.length)).toEqual([
      50, 50, 20,
    ]);
    expect(results.every(result => result.data)).toBe(true);
    // The batch route allows five requests a second: successive chunks wait their turn
    for (let index = 1; index < sentAt.length; index++)
      expect(sentAt[index] - sentAt[index - 1]).toBeGreaterThanOrEqual(200);
  });

  it('asks only for titles not cached yet when the row gains one', async () => {
    answerBatches();
    const store = setupStore();
    const items = refs(3);
    await load(store, items);

    await load(store, [...items, { mediaType: 'movie', mediaId: 5000 }]);

    expect(batchPost).toHaveBeenCalledTimes(2);
    expect(batchPost.mock.calls[1][0].json.items).toEqual([{ mediaType: 'movie', mediaId: 5000 }]);
  });

  it('fails only the titles the catalog does not know', async () => {
    answerBatches(new Set([1001]));
    const store = setupStore();

    const [found, missing] = await load(store, refs(2));

    expect(found.data).toEqual(card({ mediaType: 'movie', mediaId: 1000 }));
    expect(missing.error).toMatchObject({ status: 404 });
  });

  it('fails every title of a batch the backend rejects', async () => {
    batchPost.mockResolvedValue(json(429, { error: 'Too Many Requests' }));
    const store = setupStore();

    const results = await load(store, refs(2));

    expect(results.map(result => result.error)).toEqual([
      expect.objectContaining({ status: 429 }),
      expect.objectContaining({ status: 429 }),
    ]);
  });

  it('settles every card with an error when the batch answer cannot be read', async () => {
    batchPost.mockResolvedValue(json(200, { unexpected: true }));
    const store = setupStore();

    const results = await load(store, refs(2));

    expect(results.map(result => result.error)).toEqual([
      expect.objectContaining({ status: 500 }),
      expect.objectContaining({ status: 500 }),
    ]);
  });

  it("feeds Continue watching's selectors for a movie and an episode's show", async () => {
    answerBatches();
    const store = setupStore();
    const movie = { playable: { kind: 'movie', mediaId: 101 } } as ProgressEntry;
    const episode = {
      playable: { kind: 'episode', showMediaId: 202, seasonNumber: 1, episodeNumber: 2 },
    } as ProgressEntry;
    // useHomeFeed asks for each progress title as its progressTitle
    await load(
      store,
      [movie, episode].map(entry => {
        const { kind, mediaId } = progressTitle(entry);
        return { mediaType: kind === 'movie' ? 'movie' : 'tv', mediaId } as MediaBatchRef;
      })
    );

    expect(mediaFromProgress(store.getState(), movie)).toMatchObject({
      _type: 'movie',
      mediaId: 101,
    });
    expect(mediaFromProgress(store.getState(), episode)).toMatchObject({
      _type: 'tvshow',
      mediaId: 202,
    });
  });

  it("falls back to each title's details on a server without the batch route", async () => {
    batchPost.mockResolvedValue(json(404, { error: 'Not Found' }));
    const details = (mediaId: number) => ({
      id: mediaId,
      mediaId,
      title: `Title ${mediaId}`,
      genres: [],
      popularity: 1,
      rating: 1,
    });
    movieGet.mockImplementation(async ({ param }: { param: { id: string } }) =>
      json(200, details(Number(param.id)))
    );
    showGet.mockImplementation(async ({ param }: { param: { id: string } }) =>
      json(200, details(Number(param.id)))
    );
    const store = setupStore();

    const [movie, show] = await load(store, refs(2));
    await load(store, [{ mediaType: 'movie', mediaId: 7000 }]);

    expect(movie.data).toMatchObject({ _type: 'movie', mediaId: 1000, title: 'Title 1000' });
    expect(show.data).toMatchObject({ _type: 'tvshow', mediaId: 1001, name: 'Title 1001' });
    // Once known missing, the batch route isn't asked again
    expect(batchPost).toHaveBeenCalledTimes(1);
    expect(movieGet.mock.calls.map(([request]) => request.param.id)).toEqual(['1000', '7000']);
  });
});
