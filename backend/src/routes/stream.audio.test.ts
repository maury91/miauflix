import { noRateLimit } from '@__test-utils__/routes';
import { ContractError } from '@miauflix/contract';

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
  const mediaLoadClient = { streamFile: jest.fn(), readRemux: jest.fn() };
  const audioPlaybackService = {
    stream: jest
      .fn()
      .mockResolvedValue(new Response('fixture', { headers: { 'Content-Type': 'video/mp4' } })),
  };
  const tvRemuxService = { requestWhenDownloaded: jest.fn() };
  const app = createStreamRoutes({
    rateLimitGuard: noRateLimit,
    playbackSessionService,
    streamService,
    mediaLoadClient,
    audioPlaybackService,
    tvRemuxService,
  } as never).onError(handleError);
  return {
    tvRemuxService,
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

describe('TV remux files', () => {
  it('reads a file of the pinned source remux with the viewer Range', async () => {
    const { app, mediaLoadClient, source } = setupTest();
    mediaLoadClient.readRemux.mockResolvedValue(new Response('#EXTM3U'));
    const response = await app.request(`/${token}/remux/index.m3u8`, {
      headers: { range: 'bytes=0-' },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('#EXTM3U');
    expect(mediaLoadClient.readRemux).toHaveBeenCalledWith(source, 'index.m3u8', 'bytes=0-');
  });

  it('starts the playlist a playback opens at its start, and serves later reloads whole', async () => {
    const { app, mediaLoadClient } = setupTest();
    const playlist = [
      '#EXTM3U',
      ...Array.from({ length: 20 }, (_, index) => [
        '#EXTINF:6.000000,',
        `seg${String(index).padStart(5, '0')}.ts`,
      ]).flat(),
      '',
    ].join('\n');
    mediaLoadClient.readRemux.mockImplementation(async () => new Response(playlist));
    const lastSegment = async () =>
      (await (await app.request(`/${token}/remux/index.m3u8?start=31`)).text())
        .trimEnd()
        .split('\n')
        .at(-1);
    expect(await lastSegment()).toBe('seg00007.ts');
    // AVPlay reads the playlist twice as it opens, and starts from the second.
    expect(await lastSegment()).toBe('seg00007.ts');
    mediaLoadClient.readRemux.mockImplementationOnce(async () => new Response('segment'));
    await app.request(`/${token}/remux/seg00005.ts`);
    expect(await lastSegment()).toBe('seg00019.ts');
  });

  it('sends a shortened playlist with its own length', async () => {
    const { app, mediaLoadClient } = setupTest();
    const playlist = [
      '#EXTM3U',
      ...Array.from({ length: 20 }, (_, index) => [
        '#EXTINF:6.000000,',
        `seg${String(index).padStart(5, '0')}.ts`,
      ]).flat(),
      '',
    ].join('\n');
    mediaLoadClient.readRemux.mockResolvedValue(
      new Response(playlist, {
        headers: {
          'content-type': 'application/vnd.apple.mpegurl',
          'content-length': String(playlist.length),
        },
      })
    );
    const response = await app.request(`/${token}/remux/index.m3u8?start=31`);
    const body = await response.text();
    expect(body.length).toBeLessThan(playlist.length);
    const length = response.headers.get('content-length');
    expect(length === null || Number(length) === new TextEncoder().encode(body).length).toBe(true);
    expect(response.headers.get('content-type')).toBe('application/vnd.apple.mpegurl');
  });

  it('reads a playlist it shortens whole, whatever range was asked for', async () => {
    const { app, mediaLoadClient, source } = setupTest();
    mediaLoadClient.readRemux.mockResolvedValue(new Response('#EXTM3U\n'));
    await app.request(`/${token}/remux/index.m3u8?start=31`, {
      headers: { range: 'bytes=10-20' },
    });
    expect(mediaLoadClient.readRemux).toHaveBeenCalledWith(source, 'index.m3u8', undefined);
  });

  it('answers 404 for a file the remux does not have', async () => {
    const { app, mediaLoadClient } = setupTest();
    mediaLoadClient.readRemux.mockRejectedValue(
      new ContractError('remux_not_found', 'The remux has no such file')
    );
    expect((await app.request(`/${token}/remux/seg00009.ts`)).status).toBe(404);
  });

  it.each(['..%2Fsecret', 'index.m3u', 'seg1.ts', 'seg00001.m4s', 'init.mp4', 's1.srt'])(
    'refuses a name that is not a remux file: %s',
    async name => {
      const { app, mediaLoadClient } = setupTest();
      expect((await app.request(`/${token}/remux/${name}`)).status).toBe(400);
      expect(mediaLoadClient.readRemux).not.toHaveBeenCalled();
    }
  );

  it('rejects expired grants', async () => {
    const { app, playbackSessionService, mediaLoadClient } = setupTest();
    playbackSessionService.verify.mockResolvedValue(null);
    expect((await app.request(`/${token}/remux/index.m3u8`)).status).toBe(401);
    expect(mediaLoadClient.readRemux).not.toHaveBeenCalled();
  });

  it('has a prefetched episode remuxed for a TV that asks', async () => {
    const { app, playbackSessionService, mediaLoadClient, tvRemuxService, source } = setupTest();
    playbackSessionService.verify.mockResolvedValue({
      sourceId: 9,
      userId: 1,
      playableKind: 'episode',
      playableKey: 'e:1',
    });
    Object.assign(mediaLoadClient, { predownload: jest.fn().mockResolvedValue(true) });
    expect((await app.request(`/${token}/prefetch`, { method: 'POST' })).status).toBe(202);
    expect(tvRemuxService.requestWhenDownloaded).not.toHaveBeenCalled();
    expect((await app.request(`/${token}/prefetch?remux=true`, { method: 'POST' })).status).toBe(
      202
    );
    expect(tvRemuxService.requestWhenDownloaded).toHaveBeenCalledWith(source);
  });
});
