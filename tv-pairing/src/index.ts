import { createDiscoveryApp } from './app';

const PORT = Number(process.env.TV_PAIRING_PORT ?? 3003);
const HOST = process.env.TV_PAIRING_HOST ?? '0.0.0.0';
/**
 * The header a reverse proxy puts the client's IP in (e.g. `cf-connecting-ip`, `x-real-ip` or
 * `x-forwarded-for`, whose last entry is used). Set it behind a proxy, or every client shares the
 * proxy's IP; and only behind one that overwrites it, or clients could read any network's servers.
 */
const CLIENT_IP_HEADER = process.env.TV_PAIRING_CLIENT_IP_HEADER?.trim().toLowerCase() || null;

const app = createDiscoveryApp({
  ttlMs: Number(process.env.TV_PAIRING_TTL_SECONDS ?? 300) * 1000,
});

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  maxRequestBodySize: 4096,
  fetch(request, server) {
    const forwarded = CLIENT_IP_HEADER ? request.headers.get(CLIENT_IP_HEADER) : null;
    const clientIp =
      forwarded?.split(',').pop()?.trim() || server.requestIP(request)?.address || 'unknown';
    return app.fetch(request, clientIp);
  },
});
const sweeper = setInterval(() => app.sweep(), 60_000);
console.info(`TV pairing service listening on http://${HOST}:${server.port}`);

const shutdown = (signal: string) => {
  console.info(`TV pairing service received ${signal}, shutting down`);
  clearInterval(sweeper);
  void server.stop().then(() => process.exit(0));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
