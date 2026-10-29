import { EventEmitter } from 'node:events';

import type { PlaybackDelivery } from '@services/playback/audio-playback.service';
import type { PlaybackDeliveryUpdate } from '@services/playback/playback-session.service';

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
    catalog as never,
    null,
    { handles: () => false } as never,
    { onChange: () => () => undefined } as never
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

describe('RealtimeGateway playback delivery', () => {
  it('forwards a background probe result only to the session that started the playback', async () => {
    let deliver: ((event: PlaybackDeliveryUpdate) => void) | undefined;
    const unsubscribe = jest.fn();
    const gateway = new RealtimeGateway(
      { verifyAccessToken: jest.fn().mockResolvedValue({ userId: 'user' }) } as never,
      { get: jest.fn().mockReturnValue('__at') } as never,
      { onChange: jest.fn(), offChange: jest.fn(), remove: jest.fn() } as never,
      {} as never,
      {
        onArtwork: jest.fn(() => jest.fn()),
        onArtworkStreamReady: jest.fn(() => jest.fn()),
      } as never,
      {
        onDeliveryUpdate: (listener: (event: PlaybackDeliveryUpdate) => void) => {
          deliver = listener;
          return unsubscribe;
        },
      },
      { handles: () => false } as never,
      { onChange: () => () => undefined } as never
    );
    const connect = async (session: string) => {
      const socket = Object.assign(new EventEmitter(), {
        readyState: 1,
        send: jest.fn(),
        close: jest.fn(),
      });
      const server = (gateway as unknown as { server: EventEmitter }).server;
      server.emit('connection', socket, { headers: { cookie: `__at_${session}=fixture-token` } });
      socket.emit('message', JSON.stringify({ type: 'authenticate', session, clientId: 'client' }));
      await Promise.resolve();
      return socket;
    };
    try {
      const player = await connect('session');
      const otherDevice = await connect('other-session');
      const update = {
        type: 'delivery' as const,
        delivery: { mode: 'audio-transcode' } as PlaybackDelivery,
        streamUrl: '/x/audio',
      };
      deliver?.({ userId: 'user', sessionId: 'session', playbackId: 'playback', update });

      const sent = (socket: typeof player) =>
        socket.send.mock.calls.map(([raw]) => JSON.parse(raw as string));
      expect(sent(player)).toContainEqual({
        type: 'playback-delivery',
        playbackId: 'playback',
        update,
      });
      expect(sent(otherDevice).some(message => message.type === 'playback-delivery')).toBe(false);
    } finally {
      gateway.close();
    }
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('RealtimeGateway search routing', () => {
  it('routes search messages to the search channel and reports malformed ones', async () => {
    const search = {
      handles: jest.fn((type: string) => type.startsWith('search')),
      handle: jest.fn((_client: unknown, message: { query?: string }) => !!message.query),
    };
    const gateway = new RealtimeGateway(
      { verifyAccessToken: jest.fn().mockResolvedValue({ userId: 'user' }) } as never,
      { get: jest.fn().mockReturnValue('__at') } as never,
      { onChange: jest.fn(), offChange: jest.fn(), remove: jest.fn() } as never,
      {} as never,
      {
        onArtwork: jest.fn(() => jest.fn()),
        onArtworkStreamReady: jest.fn(() => jest.fn()),
      } as never,
      null,
      search as never,
      { onChange: () => () => undefined } as never
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
    try {
      socket.emit('message', JSON.stringify({ type: 'search', query: 'Dune' }));
      expect(search.handle).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user' }),
        expect.objectContaining({ query: 'Dune' })
      );
      socket.emit('message', JSON.stringify({ type: 'search' }));
      expect(socket.send).toHaveBeenLastCalledWith(
        JSON.stringify({ type: 'error', v: 1, message: 'Invalid search' })
      );
      const [client] = search.handle.mock.calls[0] as unknown as [{ send(message: object): void }];
      client.send({ type: 'search-recents', items: [] });
      expect(socket.send).toHaveBeenLastCalledWith(
        JSON.stringify({ type: 'search-recents', items: [] })
      );
    } finally {
      gateway.close();
    }
  });
});
