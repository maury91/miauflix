import { join } from 'node:path';

import { serve } from '@miauflix/contract';

import { ANILIST_URL, AniListLists, ANIME_LISTS_URL } from './anilist';
import { createListService } from './service';

const PORT = Number(process.env.LIST_SERVICE_PORT ?? 3002);
const HOST = process.env.LIST_SERVICE_HOST ?? '0.0.0.0';
const DATA_DIR = process.env.LIST_SERVICE_DATA_DIR ?? process.env.DATA_DIR ?? './data';
const KEY_FILE = process.env.LIST_SERVICE_KEY_FILE ?? join(DATA_DIR, '.list-service-key');

const { service } = createListService({
  dataDir: DATA_DIR,
  keyFile: KEY_FILE,
  encryptionKey: process.env.LIST_SERVICE_ENCRYPTION_KEY || undefined,
  // AniList's anime rankings and the AniList → TMDB ids (test environments point at mocks).
  aniList: new AniListLists(DATA_DIR, fetch, Date.now, {
    anilist: process.env.ANILIST_API_URL || ANILIST_URL,
    animeLists: process.env.ANIME_LISTS_URL || ANIME_LISTS_URL,
  }),
});

const server = await serve(service, { hostname: HOST, port: PORT });
console.info(`List Service listening on http://${HOST}:${server.port}`);

let stopping = false;
/** Stop the server (which also stops the service); repeated calls do nothing. */
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.info(`List Service received ${signal}, shutting down`);
  await server.stop();
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
