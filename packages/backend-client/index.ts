import { hc } from 'hono/client';

import type { RoutesApp } from '../../backend/src/routes';

// assign the client to a variable to calculate the type when compiling
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const client = hc<RoutesApp>('');
export type Client = typeof client;

export const hcWithType = (...args: Parameters<typeof hc>): Client => hc<RoutesApp>(...args);
