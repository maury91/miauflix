import type { IncomingMessage } from 'node:http';

import type { ArtworkUpdate, MediaRef } from '@miauflix/service-contracts';
import WebSocket from 'ws';

import type { ConfigService } from '@mytypes/configuration';
import type { AuthService } from '@services/auth/auth.service';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';
import type { PreloadIntentService } from '@services/preload/preload-intent.service';
import type { ProgressService } from '@services/progress/progress.service';

import { RealtimeGateway } from './realtime.gateway';

const updateFor = (ref: MediaRef): ArtworkUpdate => ({
  ...ref,
  backdrop: `backdrop-${ref.mediaId}.jpg`,
  logo: `card-${ref.mediaId}.png`,
  heroLogo: `hero-${ref.mediaId}.png`,
  artworkRevision: 1,
  cardLogoStatus: 'ready',
  heroLogoStatus: 'ready',
});

describe('RealtimeGateway artwork subscriptions', () => {
  it('sends snapshots and isolates committed updates to subscribed connections', async () => {
    let publish: ((update: ArtworkUpdate) => void) | undefined;
    const catalog = {
      onArtwork: (listener: (update: ArtworkUpdate) => void) => {
        publish = listener;
        return () => {
          publish = undefined;
        };
      },
      onArtworkStreamReady: () => () => undefined,
      artworkSnapshot: async (refs: MediaRef[]) => refs.map(updateFor),
      queueArtwork: async () => 1,
    } as unknown as CatalogClientService;
    const auth = {} as AuthService;
    const config = { get: () => undefined } as unknown as ConfigService;
    const preload = {
      onChange: () => undefined,
      offChange: () => undefined,
    } as unknown as PreloadIntentService;
    const progress = {} as ProgressService;
    const gateway = new RealtimeGateway(auth, config, preload, progress, catalog);
    const sendMovie = jest.fn();
    const sendShow = jest.fn();
    const movieState = clientState(sendMovie);
    const showState = clientState(sendShow);
    const clients = (gateway as unknown as { clients: Set<unknown> }).clients;
    clients.add(movieState);
    clients.add(showState);

    const handleMessage = (
      gateway as unknown as {
        handleMessage: (state: unknown, raw: string) => Promise<void>;
      }
    ).handleMessage.bind(gateway);
    const movieRef = { mediaType: 'movie' as const, mediaId: 11 };
    const showRef = { mediaType: 'tv' as const, mediaId: 22 };
    await handleMessage(
      movieState,
      JSON.stringify({ type: 'artwork-subscribe', items: [movieRef] })
    );
    await handleMessage(showState, JSON.stringify({ type: 'artwork-subscribe', items: [showRef] }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(sendMovie).toHaveBeenCalledWith(
      JSON.stringify({ type: 'artwork-update', ...updateFor(movieRef) })
    );
    expect(sendShow).toHaveBeenCalledWith(
      JSON.stringify({ type: 'artwork-update', ...updateFor(showRef) })
    );
    sendMovie.mockClear();
    sendShow.mockClear();

    publish?.({ ...updateFor(movieRef), artworkRevision: 2, logo: 'new-card.png' });
    expect(sendMovie).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'artwork-update',
        ...updateFor(movieRef),
        artworkRevision: 2,
        logo: 'new-card.png',
      })
    );
    expect(sendShow).not.toHaveBeenCalled();
    clearTimeout(movieState.authTimer);
    clearTimeout(showState.authTimer);
    gateway.close();
  });
});

function clientState(send: jest.Mock) {
  return {
    socket: { readyState: WebSocket.OPEN, send, close: jest.fn() },
    request: {} as IncomingMessage,
    userId: 'user-1',
    sessionId: 'session-1',
    clientId: 'client-1',
    focused: null,
    view: 'browse' as const,
    map: null,
    sequence: 0,
    focusSequence: 0,
    progressChain: Promise.resolve(),
    authTimer: setTimeout(() => undefined, 60_000),
    artworkRefs: new Set<string>(),
  };
}
