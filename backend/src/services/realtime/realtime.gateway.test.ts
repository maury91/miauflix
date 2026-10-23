import { EventEmitter } from 'node:events';

import { RealtimeGateway } from './realtime.gateway';

const setupTest = async () => {
  const preload = {
    onChange: jest.fn(),
    offChange: jest.fn(),
    remove: jest.fn(),
    update: jest.fn().mockReturnValue({ preparation: null }),
  };
  const catalog = {
    onArtwork: jest.fn(() => jest.fn()),
    onArtworkStreamReady: jest.fn(() => jest.fn()),
    queueArtwork: jest.fn().mockResolvedValue(undefined),
  };
  const gateway = new RealtimeGateway(
    { verifyAccessToken: jest.fn().mockResolvedValue({ userId: 'user' }) } as never,
    { get: jest.fn().mockReturnValue('__at') } as never,
    preload as never,
    {} as never,
    catalog as never
  );
  const socket = Object.assign(new EventEmitter(), {
    readyState: 1,
    send: jest.fn(),
    close: jest.fn(),
  });
  const server = (gateway as unknown as { server: EventEmitter }).server;
  server.emit('connection', socket, { headers: { cookie: '__at_session=fixture-token' } });
  socket.emit(
    'message',
    JSON.stringify({ type: 'authenticate', session: 'session', clientId: 'client' })
  );
  await Promise.resolve();
  const focus = (subtitleLanguage?: unknown) =>
    socket.emit(
      'message',
      JSON.stringify({
        type: 'focus',
        clientSequence: 1,
        navigationRevision: 1,
        view: 'details',
        media: { kind: 'movie', mediaId: 123 },
        subtitleLanguage,
      })
    );
  return { gateway, preload, socket, focus };
};

describe('RealtimeGateway subtitle warm-up language', () => {
  it('forwards the selected language through focus and subsequent interest heartbeats', async () => {
    const { gateway, preload, socket, focus } = await setupTest();
    try {
      focus('it');
      expect(preload.update).toHaveBeenLastCalledWith(
        'user',
        'session',
        'client',
        expect.objectContaining({ subtitleLanguage: 'it' })
      );
      socket.emit(
        'message',
        JSON.stringify({ type: 'interest-heartbeat', clientSequence: 2, visible: true })
      );
      expect(preload.update).toHaveBeenLastCalledWith(
        'user',
        'session',
        'client',
        expect.objectContaining({ subtitleLanguage: 'it', sequence: 2 })
      );
    } finally {
      gateway.close();
    }
  });

  it.each(['italian', '../en', 12, null])(
    'rejects invalid focus language %j before updating interest',
    async language => {
      const { gateway, preload, socket, focus } = await setupTest();
      try {
        focus(language);
        expect(preload.update).not.toHaveBeenCalled();
        expect(socket.send).toHaveBeenLastCalledWith(expect.stringContaining('Invalid focus'));
      } finally {
        gateway.close();
      }
    }
  );
});
