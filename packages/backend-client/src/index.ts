// This file is used to create a javascript client for the backend.
// This file is not used to create the typings for the client.
// The typings are created in the backend/src/client.ts file.
// The union of the typings and the javascript client is the final package @miauflix/backend-client
import { hc } from 'hono/client';

export { hc };

export const hcWithType = (...args: Parameters<typeof hc>) => hc(...args);
