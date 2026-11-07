// Healthcheck of the services image: checks the services this container runs, which the entrypoint
// records from its arguments (the image's CMD, or the one compose sets).
const ports: Record<string, string> = {
  bunqueue: process.env.HTTP_PORT || '6790',
  'media-catalog': process.env.CATALOG_PORT || '3001',
  'list-service': process.env.LIST_SERVICE_PORT || '3002',
  sources: process.env.SOURCES_PORT || '3003',
  'media-load': process.env.MEDIA_LOAD_PORT || '3004',
};

const names = (await Bun.file('/tmp/miauflix-services').text()).split(/\s+/).filter(Boolean);
if (!names.length) throw new Error('No services recorded yet');
await Promise.all(
  names.map(async name => {
    const url = `http://127.0.0.1:${ports[name]}/health`;
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error(`${name}: ${url} returned ${response.status}`);
  })
);
