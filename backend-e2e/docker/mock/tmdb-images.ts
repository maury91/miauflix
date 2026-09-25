import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const PORT = Number(process.env.MOCK_PORT || 80);
const ASSET_DIR = process.env.ASSET_DIR || '/app/data/images';
const FIXTURE_DIR = process.env.FIXTURE_DIR || '/app/data';
const IMAGE_PROXY_BASE_URL = `${(
  process.env.IMAGE_PROXY_BASE_URL || 'https://image.tmdb.org/t/p/'
).replace(/\/+$/u, '')}/`;
const IMAGE_PROXY_TIMEOUT_MS = 15_000;

interface FixtureEnvelope {
  data?: {
    id?: number;
    poster_path?: string | null;
    backdrop_path?: string | null;
    images?: { logos?: Array<{ file_path?: string | null }> };
  };
}

interface AssetCandidate {
  path: string;
  score: number;
}

const imagePaths = new Map<string, string>();

async function jsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await jsonFiles(path)));
    else if (entry.name.endsWith('.json')) files.push(path);
  }

  return files;
}

function assetScore(fileName: string): number {
  if (fileName.includes('-llm-v2.')) return 3;
  if (fileName.includes('-llm.')) return 2;
  return 1;
}

async function loadAssets(): Promise<Map<string, string>> {
  const candidates = new Map<string, AssetCandidate>();
  const entries = await readdir(ASSET_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = /^tmdb-(\d+)-(poster|backdrop|logo)(?:-llm(?:-v2)?)?\.(?:jpg|png)$/u.exec(
      entry.name
    );
    if (!match) continue;

    const key = `${match[1]}:${match[2]}`;
    const candidate = { path: join(ASSET_DIR, entry.name), score: assetScore(entry.name) };
    const current = candidates.get(key);
    if (!current || candidate.score > current.score) candidates.set(key, candidate);
  }

  return new Map([...candidates].map(([key, candidate]) => [key, candidate.path]));
}

function connectImagePath(path: string | null | undefined, assetPath: string | undefined): void {
  if (path && assetPath) imagePaths.set(path, assetPath);
}

async function loadFixtureImagePaths(assets: Map<string, string>): Promise<void> {
  for (const fixturePath of await jsonFiles(FIXTURE_DIR)) {
    let fixture: FixtureEnvelope;
    try {
      fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as FixtureEnvelope;
    } catch {
      continue;
    }

    const id = fixture.data?.id;
    if (typeof id !== 'number') continue;

    connectImagePath(fixture.data?.poster_path, assets.get(`${id}:poster`));
    connectImagePath(fixture.data?.backdrop_path, assets.get(`${id}:backdrop`));
    for (const logo of fixture.data?.images?.logos ?? []) {
      connectImagePath(logo.file_path, assets.get(`${id}:logo`));
    }
  }
}

interface ImageRequest {
  path: string;
  size: string;
}

function imageRequestFromPath(path: string): ImageRequest | undefined {
  const match = /^\/t\/p\/([^/]+)(\/.*)$/u.exec(path);
  return match?.[1] && match[2]
    ? { path: decodeURIComponent(match[2]), size: match[1] }
    : undefined;
}

async function proxyImage(request: ImageRequest): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(`${IMAGE_PROXY_BASE_URL}${request.size}${request.path}`, {
      signal: controller.signal,
    });
    const headers = new Headers();
    const contentType = response.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=3600');
    return new Response(response.body, { headers, status: response.status });
  } catch {
    return new Response('Image proxy failed', { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

const assets = await loadAssets();
await loadFixtureImagePaths(assets);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    if (req.method !== 'GET') return new Response('Method not supported', { status: 405 });

    const imageRequest = imageRequestFromPath(url.pathname);
    if (!imageRequest) return new Response('Image fixture not found', { status: 404 });

    const assetPath = imagePaths.get(imageRequest.path);
    if (!assetPath || !(await Bun.file(assetPath).exists())) return proxyImage(imageRequest);

    const contentType = assetPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return new Response(Bun.file(assetPath), {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': contentType,
      },
    });
  },
});

console.log(`TMDB image mock listening on http://localhost:${PORT}`);
console.log(`Mapped ${imagePaths.size} fixture image paths to local assets`);
