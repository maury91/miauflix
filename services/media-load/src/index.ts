import { serve } from '@miauflix/contract';

import { createMediaLoadService } from './service';

const DEFAULT_PORT = 3004;
/** An empty or invalid MEDIA_LOAD_PORT would bind a random port (or fail): use the default. */
const configuredPort = Number(process.env.MEDIA_LOAD_PORT);
const PORT =
  Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort < 65536
    ? configuredPort
    : DEFAULT_PORT;
const HOST = process.env.MEDIA_LOAD_HOST ?? '0.0.0.0';
const DATA_DIR = process.env.MEDIA_LOAD_DATA_DIR ?? process.env.DATA_DIR ?? './data';

const { service } = createMediaLoadService({ dataDir: DATA_DIR });

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
