jest.mock('@middleware/rate-limit.middleware', () => ({
  createRateLimitMiddlewareFactory:
    () => () => async (_context: unknown, next: () => Promise<void>) =>
      next(),
}));

import { createStreamRoutes } from './stream.routes';

const token = 'a'.repeat(43);
const setupTest = () => {
  const source = { id: 9, movieId: 12 };
  const grant = {
    sourceId: 9,
    playableKind: 'movie',
    playableKey: 'm:123',
    expiresAt: new Date(Date.now() + 60_000),
  };
  const playbackSessionService = { verify: jest.fn().mockResolvedValue(grant) };
  const streamService = {
    getSourceById: jest.fn().mockResolvedValue(source),
    getBestSourceForStreaming: jest.fn(),
  };
  const mediaService = { getMovieById: jest.fn().mockResolvedValue({ mediaId: 123 }) };
  const audioPlaybackService = {
    stream: jest
      .fn()
      .mockResolvedValue(new Response('fixture', { headers: { 'Content-Type': 'video/mp4' } })),
  };
  const app = createStreamRoutes({
    playbackSessionService,
    streamService,
    mediaService,
    audioPlaybackService,
  } as never);
  return {
    app,
    playbackSessionService,
    streamService,
    mediaService,
    audioPlaybackService,
    source,
    grant,
  };
};

describe('audio streaming authorization', () => {
  it('converts only the pinned source and forwards the seek and expiration', async () => {
    const { app, audioPlaybackService, streamService, source, grant } = setupTest();
    const response = await app.request(`/${token}/audio?start=45&audioTrack=1`);
    expect(response.status).toBe(200);
    expect(audioPlaybackService.stream).toHaveBeenCalledWith(
      source,
      token,
      45,
      grant.expiresAt,
      expect.any(AbortSignal),
      1
    );
    expect(streamService.getBestSourceForStreaming).not.toHaveBeenCalled();
  });

  it('rejects expired grants before opening the source', async () => {
    const { app, playbackSessionService, audioPlaybackService, streamService } = setupTest();
    playbackSessionService.verify.mockResolvedValue(null);
    expect((await app.request(`/${token}/audio`)).status).toBe(401);
    expect(streamService.getSourceById).not.toHaveBeenCalled();
    expect(audioPlaybackService.stream).not.toHaveBeenCalled();
  });

  it('rejects a source whose movie no longer matches the grant', async () => {
    const { app, mediaService, audioPlaybackService } = setupTest();
    mediaService.getMovieById.mockResolvedValue({ mediaId: 999 });
    expect((await app.request(`/${token}/audio`)).status).toBe(403);
    expect(audioPlaybackService.stream).not.toHaveBeenCalled();
  });

  it.each(['-1', 'NaN', 'Infinity', '1.5'])('rejects invalid audio track %s', async audioTrack => {
    const { app, audioPlaybackService } = setupTest();
    expect((await app.request(`/${token}/audio?audioTrack=${audioTrack}`)).status).toBe(400);
    expect(audioPlaybackService.stream).not.toHaveBeenCalled();
  });

  it.each(['-1', 'NaN', 'Infinity'])('rejects invalid seek %s', async start => {
    const { app, audioPlaybackService } = setupTest();
    expect((await app.request(`/${token}/audio?start=${start}`)).status).toBe(400);
    expect(audioPlaybackService.stream).not.toHaveBeenCalled();
  });
});
