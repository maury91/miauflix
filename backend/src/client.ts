/// <reference types="./types/webtorrent.d.ts" />

import { hc } from 'hono/client';

import type { RoutesApp } from './routes';

// assign the client to a variable to calculate the type when compiling
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const client = hc<RoutesApp>('');
export type Client = typeof client;

export const hcWithType = (...args: Parameters<typeof hc>): Client => hc<RoutesApp>(...args);

// Re-export utility types
export type {
  AudioCodec,
  Language,
  Quality,
  Source,
  VideoCodec,
} from '@miauflix/source-metadata-extractor';

// Re-export route DTOs for consumers
export type * from './routes/auth.types';
export type * from './routes/list.types';
export type * from './routes/movie.types';
export type * from './routes/progress.types';
export type * from './routes/show.types';
export type * from './routes/stream.types';
export type * from './routes/trakt.types';
