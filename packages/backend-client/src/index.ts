import { hc } from 'hono/client';
export { hc };

export const hcWithType = (...args: Parameters<typeof hc>) => hc(...args);
