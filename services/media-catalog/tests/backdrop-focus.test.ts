import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { BackdropFocusRepository } from '../src/db/backdrop-focus.repo';
import { CatalogDatabase } from '../src/db/database';
import { BackdropFocusService } from '../src/services/backdrop-focus.service';

const fixture = readFileSync(
  join(import.meta.dir, '../../../test-fixtures/providers/tmdb/images/tmdb-675871-backdrop.jpg')
);
const originalFetch = globalThis.fetch;
const directories: string[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
  directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }));
});

describe('BackdropFocusService', () => {
  it('uses a square crop and serves the cached focus afterward', async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests++;
      return new Response(fixture, { headers: { 'content-type': 'image/jpeg' } });
    }) as unknown as typeof fetch;

    const dataDir = mkdtempSync(join(tmpdir(), 'backdrop-focus-'));
    directories.push(dataDir);
    const database = new CatalogDatabase(dataDir);
    const service = new BackdropFocusService(
      new BackdropFocusRepository(database),
      async () => null
    );
    const source = { key: '/sample.jpg', url: 'https://image.tmdb.org/t/p/w780/sample.jpg' };

    const first = await service.ensure(source, 'tmdb');
    const second = await service.ensure(source, 'tmdb');

    expect(first).toEqual(second);
    expect(requests).toBe(1);
    expect(first.x).toBeCloseTo(0.596591, 6);
    expect(first.y).toBeCloseTo(0.497875, 6);
    database.close();
  });

  it('uses the detector focus and caches the grouped result', async () => {
    let requests = 0;
    let detections = 0;
    globalThis.fetch = (async () => {
      requests++;
      return new Response(fixture, { headers: { 'content-type': 'image/jpeg' } });
    }) as unknown as typeof fetch;

    const dataDir = mkdtempSync(join(tmpdir(), 'backdrop-focus-'));
    directories.push(dataDir);
    const database = new CatalogDatabase(dataDir);
    const service = new BackdropFocusService(new BackdropFocusRepository(database), async () => {
      detections++;
      return { x: 0.42, y: 0.58 };
    });
    const source = { key: '/detected.jpg', url: 'https://image.tmdb.org/t/p/w780/detected.jpg' };

    expect(await service.ensure(source, 'tmdb')).toEqual({ x: 0.42, y: 0.58 });
    expect(await service.ensure(source, 'tmdb')).toEqual({ x: 0.42, y: 0.58 });
    expect(requests).toBe(1);
    expect(detections).toBe(1);
    database.close();
  });
});
