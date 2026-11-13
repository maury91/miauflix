import { noRateLimit } from '@__test-utils__/routes';

import { ErrorWithStatus } from '@errors/error-with-status.error';
import { handleError } from '@middleware/error-handler.middleware';

import { createStreamRoutes } from './stream.routes';

const token = 'a'.repeat(43);
const setupTest = () => {
  const source = { source: { id: 9 }, filePath: 'movie.mkv', matchKind: 'movie' };
  const grant = {
    sourceId: 9,
    playableKind: 'movie',
    playableKey: 'm:123',
    expiresAt: new Date(Date.now() + 60_000),
  };
  const playbackSessionService = { verify: jest.fn().mockResolvedValue(grant) };
  const streamService = {
    getSourceById: jest.fn(),
    resolvePlaybackTarget: jest.fn().mockResolvedValue({ target: source, movie: { id: 12 } }),
  };
  const mediaLoadClient = { streamFile: jest.fn() };
  const audioPlaybackService = {
    stream: jest
      .fn()
      .mockResolvedValue(new Response('fixture', { headers: { 'Content-Type': 'video/mp4' } })),
  };
  const app = createStreamRoutes({
    rateLimitGuard: noRateLimit,
    playbackSessionService,
    streamService,
    mediaLoadClient,
    audioPlaybackService,
  } as never).onError(handleError);
  return {
    app,
    playbackSessionService,
    streamService,
    mediaLoadClient,
    audioPlaybackService,
    source,
    grant,
  };
};

describe('direct streaming errors', () => {
  it.each([
    ['source_file_unavailable', 404],
    ['local_media_unavailable', 410],
  ])('returns the playback status for %s', async (code, status) => {
    const { app, mediaLoadClient } = setupTest();
    mediaLoadClient.streamFile.mockRejectedValue(new ErrorWithStatus('Unavailable', code));

    const response = await app.request(`/${token}`);

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: 'Unavailable' });
  });

  it('refuses a key that is not an active playback grant', async () => {
    const { app, playbackSessionService, streamService, mediaLoadClient } = setupTest();
    playbackSessionService.verify.mockResolvedValue(null);

    const response = await app.request(`/${token}`);

    expect(response.status).toBe(401);
    expect(streamService.resolvePlaybackTarget).not.toHaveBeenCalled();
    expect(mediaLoadClient.streamFile).not.toHaveBeenCalled();
  });
});

describe('next-episode prefetch', () => {
  it('returns 202 without awaiting or surfacing predownload failures', async () => {
    const { playbackSessionService, streamService } = setupTest();
    playbackSessionService.verify.mockResolvedValue({
      sourceId: 9,
      userId: 1,
      playableKind: 'episode',
      playableKey: 'e:1',
    });
    const downloadService = {
      predownload: jest
        .fn()
        .mockReturnValue(new Promise((_, reject) => setTimeout(reject, 5, new Error('full')))),
    };
    const app = createStreamRoutes({
      rateLimitGuard: noRateLimit,
      playbackSessionService,
      streamService,
      mediaLoadClient: downloadService,
    } as never).onError(handleError);
    const response = await app.request(`/${token}/prefetch`, { method: 'POST' });
    expect(response.status).toBe(202);
    expect(downloadService.predownload).toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
});

describe('audio streaming authorization', () => {
  it('converts only the pinned source and forwards the seek and expiration', async () => {
    const { app, audioPlaybackService, source, grant } = setupTest();
    const response = await app.request(`/${token}/audio?start=45&audioTrack=1`);
    expect(response.status).toBe(200);
    expect(audioPlaybackService.stream).toHaveBeenCalledWith(
      source,
      token,
      45,
      grant.expiresAt,
      expect.any(AbortSignal),
      1,
      false,
      false
    );
  });

  it('forwards explicit video conversion for the pinned source', async () => {
    const { app, audioPlaybackService, source, grant } = setupTest();
    expect((await app.request(`/${token}/audio?transcodeVideo=true`)).status).toBe(200);
    expect(audioPlaybackService.stream).toHaveBeenCalledWith(
      source,
      token,
      0,
      grant.expiresAt,
      expect.any(AbortSignal),
      undefined,
      false,
      true
    );
  });

  it('rejects expired grants before opening the source', async () => {
    const { app, playbackSessionService, audioPlaybackService, streamService } = setupTest();
    playbackSessionService.verify.mockResolvedValue(null);
    expect((await app.request(`/${token}/audio`)).status).toBe(401);
    expect(streamService.resolvePlaybackTarget).not.toHaveBeenCalled();
    expect(audioPlaybackService.stream).not.toHaveBeenCalled();
  });

  it('rejects a source whose movie no longer matches the grant', async () => {
    const { app, streamService, audioPlaybackService } = setupTest();
    streamService.resolvePlaybackTarget.mockResolvedValue(null);
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
