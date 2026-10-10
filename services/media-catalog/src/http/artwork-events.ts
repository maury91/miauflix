import type { Server, WebSocketHandler } from 'bun';

import type { ServiceContext } from '../service-context';
import { BASE_PATH } from './handlers/consts';
import type { Router } from './router';

type ArtworkSocketData = {
  catalog: NonNullable<ServiceContext['catalog']>;
  unsubscribe?: () => void;
};

/** Internal catalog feed: one JSON artwork update per WebSocket message. */
export const createArtworkEventsTransport = (context: ServiceContext, router: Router) => ({
  fetch(req: Request, server: Server<ArtworkSocketData>) {
    if (
      req.method !== 'GET' ||
      new URL(req.url).pathname.replace(/\/+$/, '') !== `${BASE_PATH}/media/artwork/events`
    ) {
      return router.handle(req);
    }
    if (context.config.state !== 'ready' || !context.catalog) {
      return Response.json(
        { code: 'catalog_not_configured', message: 'Catalog is not ready' },
        { status: 503 }
      );
    }
    if (server.upgrade(req, { data: { catalog: context.catalog } })) return undefined;
    return new Response('WebSocket upgrade required', { status: 426 });
  },
  websocket: {
    idleTimeout: 60,
    sendPings: true,
    backpressureLimit: 1024 * 1024,
    closeOnBackpressureLimit: true,
    maxPayloadLength: 1024,
    open(socket) {
      socket.data.unsubscribe = socket.data.catalog.onArtworkUpdate(update => {
        socket.send(JSON.stringify(update));
      });
    },
    message(socket) {
      socket.close(1008, 'Artwork feed does not accept messages');
    },
    close(socket) {
      socket.data.unsubscribe?.();
    },
  } satisfies WebSocketHandler<ArtworkSocketData>,
});
