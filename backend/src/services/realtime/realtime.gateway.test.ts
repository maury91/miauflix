import type { PlaybackDelivery } from '@services/playback/audio-playback.service';
import type { PlaybackPiecesUpdate } from '@services/playback/playback-pieces.service';
import type { PlaybackDeliveryUpdate } from '@services/playback/playback-session.service';

import { RealtimeGateway, type RealtimeSocketData } from './realtime.gateway';

/** A Bun `ServerWebSocket` stand-in opened on the gateway; `emit` delivers a message or a close. */
const openSocket = (gateway: RealtimeGateway, cookie = '') => {
  const socket = {
    data: { cookie } as RealtimeSocketData,
    readyState: 1,
    send: jest.fn(),
    close: jest.fn(),
    emit(event: 'close' | 'message', raw = '') {
      if (event === 'message') void gateway.websocket.message(socket as never, raw);
      else void gateway.websocket.close?.(socket as never, 1000, '');
    },
  };
  void gateway.websocket.open?.(socket as never);
  return socket;
};

/** An AuthService stand-in: every token is valid for the session it is sent for. */
const authStub = () => {
  const listeners = new Set<(revocation: { userId: string; session: string }) => void>();
  const sessions = new Map<string, boolean>();
  return {
    authenticateAccessToken: jest.fn(async (_token: string, sessionId: string) => ({
      userId: 'user',
      sessionId,
      email: 'user@example.com',
      role: 'user',
    })),
    resolveSession: jest.fn(async (userId: string, sessionId: string) =>
      sessions.get(sessionId) === false
        ? null
        : { userId, sessionId, email: 'user@example.com', role: 'user' }
    ),
    onSessionRevoked: jest.fn(
      (listener: (revocation: { userId: string; session: string }) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    ),
    /** Ends `session` and tells the gateway, as a logout does. */
    revoke(userId: string, session: string) {
      sessions.set(session, false);
      for (const listener of listeners) listener({ userId, session });
    },
  };
};

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
    authStub() as never,
    { get: jest.fn().mockReturnValue('__at') } as never,
    preload as never,
    {} as never,
    catalog as never,
    null,
    { handles: () => false } as never,
    { onChange: () => () => undefined } as never
  );
  const socket = openSocket(gateway, '__at_session=fixture-token');
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
      authStub() as never,
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
      const socket = openSocket(gateway, `__at_${session}=fixture-token`);
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

describe('RealtimeGateway playback pieces', () => {
  it('sends a playback’s downloaded ranges to its session, and the latest ones on connect', async () => {
    let deliver: ((update: PlaybackPiecesUpdate) => void) | undefined;
    const unsubscribe = jest.fn();
    const latest: PlaybackPiecesUpdate = {
      userId: 'user',
      sessionId: 'session',
      playbackId: 'playback',
      ranges: [[0, 100]],
    };
    const pieces = {
      onRanges: (listener: (update: PlaybackPiecesUpdate) => void) => {
        deliver = listener;
        return unsubscribe;
      },
      latestFor: jest.fn((userId: string, sessionId: string) =>
        userId === 'user' && sessionId === 'session' ? [latest] : []
      ),
    };
    const gateway = new RealtimeGateway(
      authStub() as never,
      { get: jest.fn().mockReturnValue('__at') } as never,
      { onChange: jest.fn(), offChange: jest.fn(), remove: jest.fn() } as never,
      {} as never,
      {
        onArtwork: jest.fn(() => jest.fn()),
        onArtworkStreamReady: jest.fn(() => jest.fn()),
      } as never,
      null,
      { handles: () => false } as never,
      { onChange: () => () => undefined } as never,
      pieces
    );
    const connect = async (session: string) => {
      const socket = openSocket(gateway, `__at_${session}=fixture-token`);
      socket.emit('message', JSON.stringify({ type: 'authenticate', session, clientId: 'client' }));
      await Promise.resolve();
      return socket;
    };
    const sent = (socket: { send: jest.Mock }) =>
      socket.send.mock.calls
        .map(([raw]) => JSON.parse(raw as string))
        .filter(message => message.type === 'playback-pieces');
    try {
      const player = await connect('session');
      const otherDevice = await connect('other-session');
      expect(sent(player)).toEqual([
        { type: 'playback-pieces', playbackId: 'playback', ranges: [[0, 100]] },
      ]);
      deliver?.({ ...latest, ranges: [[0, 250]] });
      expect(sent(player).at(-1)).toEqual({
        type: 'playback-pieces',
        playbackId: 'playback',
        ranges: [[0, 250]],
      });
      expect(sent(otherDevice)).toEqual([]);
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
      authStub() as never,
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
    const socket = openSocket(gateway, '__at_session=fixture-token');
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

describe('RealtimeGateway TV app authentication', () => {
  const setupGateway = (allowTvApp: boolean, allowNullOrigin = false) => {
    const auth = authStub();
    const gateway = new RealtimeGateway(
      auth as never,
      {
        get: jest.fn((key: string) =>
          key === 'ALLOW_TV_APP'
            ? allowTvApp
            : key === 'ALLOW_TV_APP_NULL_ORIGIN'
              ? allowNullOrigin
              : key === 'CORS_ORIGIN'
                ? ['https://app']
                : '__at'
        ),
      } as never,
      { onChange: jest.fn(), offChange: jest.fn(), remove: jest.fn(), update: jest.fn() } as never,
      {} as never,
      {
        onArtwork: jest.fn(() => jest.fn()),
        onArtworkStreamReady: jest.fn(() => jest.fn()),
        queueArtwork: jest.fn(),
      } as never,
      null,
      { handles: () => false } as never,
      { onChange: () => () => undefined } as never
    );
    return { gateway, auth };
  };

  it('authenticates with the access token sent in the message', async () => {
    const { gateway, auth } = setupGateway(true);
    const socket = openSocket(gateway);
    try {
      socket.emit(
        'message',
        JSON.stringify({
          type: 'authenticate',
          session: 'session',
          clientId: 'client',
          accessToken: 'tv-token',
        })
      );
      await new Promise(resolve => setImmediate(resolve));
      expect(auth.authenticateAccessToken).toHaveBeenCalledWith('tv-token', 'session');
      expect(socket.close).not.toHaveBeenCalled();
      expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ready', v: 1 }));
    } finally {
      gateway.close();
    }
  });

  it.each([
    [true, false, 'file://', true],
    [true, false, 'null', false],
    [true, true, 'null', true],
    [false, true, 'file://', false],
    [true, false, 'https://evil', false],
    [true, false, 'https://app', true],
  ])(
    'with ALLOW_TV_APP=%s and ALLOW_TV_APP_NULL_ORIGIN=%s accepts origin %s: %s',
    (allowTvApp, allowNullOrigin, origin, accepted) => {
      const { gateway } = setupGateway(allowTvApp, allowNullOrigin);
      try {
        const isAllowedOrigin = (
          gateway as unknown as { isAllowedOrigin(origin: string): boolean }
        ).isAllowedOrigin.bind(gateway);
        expect(isAllowedOrigin(origin)).toBe(accepted);
      } finally {
        gateway.close();
      }
    }
  );
});

describe('RealtimeGateway session revocation', () => {
  it('closes only the sockets of a revoked session', async () => {
    const auth = authStub();
    const gateway = new RealtimeGateway(
      auth as never,
      { get: jest.fn().mockReturnValue('__at') } as never,
      { onChange: jest.fn(), offChange: jest.fn(), remove: jest.fn() } as never,
      {} as never,
      {
        onArtwork: jest.fn(() => jest.fn()),
        onArtworkStreamReady: jest.fn(() => jest.fn()),
      } as never,
      null,
      { handles: () => false } as never,
      { onChange: () => () => undefined } as never
    );
    const connect = async (session: string) => {
      const socket = openSocket(gateway, `__at_${session}=fixture-token`);
      socket.emit('message', JSON.stringify({ type: 'authenticate', session, clientId: 'client' }));
      await new Promise(resolve => setImmediate(resolve));
      return socket;
    };
    try {
      const loggedOut = await connect('session');
      const otherDevice = await connect('other-session');
      auth.revoke('user', 'session');
      await new Promise(resolve => setImmediate(resolve));
      expect(loggedOut.close).toHaveBeenCalledWith(1008, 'Session ended');
      expect(otherDevice.close).not.toHaveBeenCalled();
    } finally {
      gateway.close();
    }
  });
});
