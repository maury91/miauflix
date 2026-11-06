import { serve } from '@miauflix/contract';

import { createMediaLoadService } from './service';

const PORT = Number(process.env.MEDIA_LOAD_PORT ?? 3004);
const HOST = process.env.MEDIA_LOAD_HOST ?? '0.0.0.0';

const { service } = createMediaLoadService();

const server = await serve(service, { hostname: HOST, port: PORT });
console.info(`Media load listening on http://${HOST}:${server.port}`);

let stopping = false;
/** Stop the server (which also stops the service); repeated calls do nothing. */
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.info(`Media load received ${signal}, shutting down`);
  await server.stop();
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
