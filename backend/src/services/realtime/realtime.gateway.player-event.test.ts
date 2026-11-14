jest.mock('@logger');

import { logger } from '@logger';

import { RealtimeGateway, type RealtimeSocketData } from './realtime.gateway';

const setupTest = async () => {
  const gateway = new RealtimeGateway({
    authService: {
      authenticateAccessToken: jest.fn(async (_token: string, sessionId: string) => ({
        userId: 'user',
        sessionId,
        email: 'user@example.com',
        role: 'user',
      })),
      onSessionRevoked: jest.fn(() => () => undefined),
    } as never,
    config: { get: jest.fn().mockReturnValue('__at') } as never,
    preload: { onChange: jest.fn(), offChange: jest.fn(), remove: jest.fn() } as never,
    progress: {} as never,
    catalog: {
      onArtwork: jest.fn(() => jest.fn()),
      onArtworkStreamReady: jest.fn(() => jest.fn()),
    } as never,
    playback: null,
    search: { handles: () => false } as never,
    availability: { onChange: () => () => undefined } as never,
  });
  const socket = {
    data: { cookie: '__at_session=fixture-token' } as RealtimeSocketData,
    readyState: 1,
    send: jest.fn(),
    close: jest.fn(),
  };
  void gateway.websocket.open?.(socket as never);
  const emit = (message: object) =>
    gateway.websocket.message(socket as never, JSON.stringify(message));
  await emit({ type: 'authenticate', session: 'session', clientId: 'client' });
  return { gateway, socket, emit };
};

const event = {
  type: 'player-event',
  playbackId: 'a'.repeat(32),
  kind: 'gap-jump',
  from: 120.5,
  to: 121.26,
  buffered: [
    [90, 121.2],
    [121.25, 180],
  ],
  decodedFrames: 2890,
};

describe('RealtimeGateway player events', () => {
  beforeEach(() => jest.mocked(logger.info).mockClear());

  it('logs a stall-watchdog move with where it went and what was buffered', async () => {
    const { gateway, emit } = await setupTest();
    try {
      await emit(event);
      expect(logger.info).toHaveBeenCalledWith(
        'PlayerEvents',
        `gap-jump 120.50 -> 121.26 (playback ${'a'.repeat(32)}, buffered 90.00-121.20 121.25-180.00, decoded frames 2890)`
      );
    } finally {
      gateway.close();
    }
  });

  it('rejects a malformed event without logging it', async () => {
    const { gateway, socket, emit } = await setupTest();
    try {
      await emit({ ...event, kind: 'teleport' });
      await emit({ ...event, from: -1 });
      expect(logger.info).not.toHaveBeenCalledWith('PlayerEvents', expect.anything());
      expect(socket.send).toHaveBeenLastCalledWith(
        JSON.stringify({ type: 'error', v: 1, message: 'Invalid player event' })
      );
    } finally {
      gateway.close();
    }
  });

  it('logs at most 30 events a minute per socket', async () => {
    const { gateway, emit } = await setupTest();
    try {
      for (let index = 0; index < 40; index++) await emit(event);
      const logged = jest
        .mocked(logger.info)
        .mock.calls.filter(([context]) => context === 'PlayerEvents');
      expect(logged).toHaveLength(30);
    } finally {
      gateway.close();
    }
  });
});
