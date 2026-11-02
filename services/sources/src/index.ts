import { join } from 'node:path';

import { serve } from '@miauflix/contract';

import { createSourcesService } from './service';

const PORT = Number(process.env.SOURCES_PORT ?? 3003);
const HOST = process.env.SOURCES_HOST ?? '0.0.0.0';
const DATA_DIR = process.env.SOURCES_DATA_DIR ?? process.env.DATA_DIR ?? './data';
const KEY_FILE = process.env.SOURCES_KEY_FILE ?? join(DATA_DIR, '.sources-key');

const { service } = createSourcesService({
  dataDir: DATA_DIR,
  keyFile: KEY_FILE,
  encryptionKey: process.env.SOURCES_ENCRYPTION_KEY || undefined,
  useGit: process.env.SOURCES_USE_GIT !== 'false',
  preloadProviders: process.env.SOURCES_PRELOAD_PROVIDERS || undefined,
});

const server = await serve(service, { hostname: HOST, port: PORT });
console.info(`Sources listening on http://${HOST}:${server.port}`);

let stopping = false;
/** Stop the server (which also stops the service); repeated calls do nothing. */
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.info(`Sources received ${signal}, shutting down`);
  await server.stop();
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
