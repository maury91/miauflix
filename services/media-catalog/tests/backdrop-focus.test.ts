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

  it('limits concurrent detector work to the configured queue size', async () => {
    let activeDetections = 0;
    let maximumDetections = 0;
    globalThis.fetch = (async () =>
      new Response(fixture, {
        headers: { 'content-type': 'image/jpeg' },
      })) as unknown as typeof fetch;

    const dataDir = mkdtempSync(join(tmpdir(), 'backdrop-focus-'));
    directories.push(dataDir);
    const database = new CatalogDatabase(dataDir);
    const service = new BackdropFocusService(
      new BackdropFocusRepository(database),
      async () => {
        activeDetections++;
        maximumDetections = Math.max(maximumDetections, activeDetections);
        await new Promise(resolve => setTimeout(resolve, 10));
        activeDetections--;
        return { x: 0.5, y: 0.5 };
      },
      2
    );

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        service.ensure(
          { key: `/queued-${index}.jpg`, url: 'https://image.tmdb.org/t/p/w780/queued.jpg' },
          'tmdb'
        )
      )
    );

    expect(maximumDetections).toBe(2);
    database.close();
  });

  it('promotes immediate requests ahead of displayed and database background work', async () => {
    let releaseFirst!: () => void;
    let signalFirst!: () => void;
    const firstStarted = new Promise<void>(resolve => {
      signalFirst = resolve;
    });
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    let currentUrl = '';
    const detectorOrder: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      currentUrl = String(input);
      return new Response(fixture, { headers: { 'content-type': 'image/jpeg' } });
    }) as unknown as typeof fetch;

    const dataDir = mkdtempSync(join(tmpdir(), 'backdrop-focus-'));
    directories.push(dataDir);
    const database = new CatalogDatabase(dataDir);
    const service = new BackdropFocusService(
      new BackdropFocusRepository(database),
      async () => {
        detectorOrder.push(currentUrl);
        if (detectorOrder.length === 1) {
          signalFirst();
          await firstGate;
        }
        return { x: 0.5, y: 0.5 };
      },
      1
    );
    const databaseOne = {
      key: '/database-one.jpg',
      url: 'https://image.tmdb.org/t/p/w780/database-one.jpg',
    };
    const databaseTwo = {
      key: '/database-two.jpg',
      url: 'https://image.tmdb.org/t/p/w780/database-two.jpg',
    };
    const displayed = {
      key: '/displayed.jpg',
      url: 'https://image.tmdb.org/t/p/w780/displayed.jpg',
    };

    expect(service.enqueueBackground(databaseOne, 'tmdb', 'database')).toBe(true);
    await firstStarted;
    expect(service.enqueueBackground(databaseTwo, 'tmdb', 'database')).toBe(true);
    expect(service.enqueueBackground(displayed, 'tmdb', 'displayed')).toBe(true);
    const immediate = service.ensure(databaseTwo, 'tmdb');
    releaseFirst();
    await immediate;

    expect(detectorOrder).toEqual([databaseOne.url, databaseTwo.url]);
    await new Promise(resolve => setTimeout(resolve, 25));
    database.close();
  });

  it('drops queued background analyses once stopped, keeping running and immediate ones', async () => {
    const started = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    const downloaded: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      downloaded.push(String(input));
      return new Response(fixture, { headers: { 'content-type': 'image/jpeg' } });
    }) as unknown as typeof fetch;
    const dataDir = mkdtempSync(join(tmpdir(), 'backdrop-focus-'));
    directories.push(dataDir);
    const database = new CatalogDatabase(dataDir);
    const repository = new BackdropFocusRepository(database);
    const service = new BackdropFocusService(
      repository,
      async () => {
        started.resolve();
        await gate.promise;
        return { x: 0.5, y: 0.5 };
      },
      1
    );
    const source = (name: string) => ({
      key: `/${name}.jpg`,
      url: `https://image.tmdb.org/t/p/w780/${name}.jpg`,
    });
    try {
      expect(service.enqueueBackground(source('running'), 'tmdb', 'database')).toBe(true);
      await started.promise;
      expect(service.enqueueBackground(source('queued-database'), 'tmdb', 'database')).toBe(true);
      expect(service.enqueueBackground(source('queued-displayed'), 'tmdb', 'displayed')).toBe(true);

      // The catalog that owns this service is retired while an analysis is running
      service.stopBackground();
      expect(service.hasPendingBackground('database')).toBe(false);
      expect(service.hasPendingBackground('displayed')).toBe(false);
      expect(service.enqueueBackground(source('late'), 'tmdb', 'database')).toBe(false);
      // Requests the retired instance is still serving get their answer, even for a key whose
      // background task was cancelled in this same tick
      const immediate = service.ensure(source('requested'), 'tmdb');
      const cancelledKey = service.ensure(source('queued-displayed'), 'tmdb');
      gate.resolve();
      expect(await immediate).toEqual({ x: 0.5, y: 0.5 });
      expect(await cancelledKey).toEqual({ x: 0.5, y: 0.5 });
      await new Promise(resolve => setTimeout(resolve, 25));

      expect(downloaded).toEqual([
        source('running').url,
        source('requested').url,
        source('queued-displayed').url,
      ]);
      expect(repository.get({ provider: 'tmdb', imageKey: '/running.jpg' })).not.toBeNull();
      expect(repository.get({ provider: 'tmdb', imageKey: '/queued-database.jpg' })).toBeFalsy();
      expect(
        repository.get({ provider: 'tmdb', imageKey: '/queued-displayed.jpg' })
      ).not.toBeNull();
    } finally {
      gate.resolve();
      database.close();
    }
  });
});
