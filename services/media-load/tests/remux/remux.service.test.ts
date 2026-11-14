import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RemuxPlan, RemuxStatus } from '@miauflix/service-contracts';
import { afterEach, describe, expect, it, jest } from 'bun:test';

import { RemuxService } from '../../src/remux/remux.service';
import type { Storage } from '../../src/storage/types';
import { createSource, testDatabase } from '../helpers/engine';

const plan: RemuxPlan = {
  videoCodec: 'hevc',
  durationSeconds: 12,
  audio: [
    { audioIndex: 0, copy: false, channels: 6, language: 'eng', title: null, isDefault: true },
  ],
  subtitles: [
    {
      subtitleIndex: 0,
      kind: 'text',
      codec: 'subrip',
      language: 'eng',
      title: 'English',
      isDefault: false,
      forced: false,
      hearingImpaired: true,
    },
  ],
};

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
  delete process.env.FAKE_FFMPEG_EXIT;
  delete process.env.FAKE_FFMPEG_HANG;
  delete process.env.FAKE_FFMPEG_RELEASE;
});

const setup = async (options: { complete?: boolean } = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'remux-test-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const ffmpeg = join(root, 'ffmpeg');
  await writeFile(
    ffmpeg,
    `#!/bin/sh\nexec "${process.execPath}" "${join(import.meta.dir, 'fake-ffmpeg.ts')}" "$@"\n`
  );
  await chmod(ffmpeg, 0o755);
  const database = await testDatabase();
  const stored: Storage[] = [];
  for (const id of [1, 2]) {
    await createSource(database, { id, hash: String(id).repeat(40) });
    const storage = await database
      .getStorageRepository()
      .create({ sourceId: id, location: join(root, `source-${id}`) });
    stored.push({
      ...storage,
      encryptedLayout: {
        files: [{ path: 'Show/E01.mkv', length: 10, offset: 0 }],
      } as Storage['encryptedLayout'],
    });
  }
  let deleteListener: ((storage: Storage) => void) | null = null;
  const complete = { value: options.complete ?? true };
  const storage = {
    getStorageBySource: jest.fn(async (sourceId: number) => stored[sourceId - 1] ?? null),
    released: jest.fn(async () => undefined),
    reserveAdditional: jest.fn(
      async (_sourceId: number, _bytes: number, _retained: boolean): Promise<() => Promise<void>> =>
        storage.released
    ),
    markAsAccessed: jest.fn(async () => undefined),
    on: jest.fn((_event: 'delete', listener: (storage: Storage) => void) => {
      deleteListener = listener;
    }),
  };
  const service = new RemuxService({
    repository: database.getRemuxRepository(),
    encryption: database.encryption,
    storage,
    isFileComplete: async () => complete.value,
    readSource: async () => new Response('source bytes'),
    ffmpegPath: ffmpeg,
    retryMs: 20,
  });
  cleanups.push(() => service.close());
  const events: RemuxStatus[] = [];
  service.onChange(status => events.push(status));
  const settled = (sourceId: number) =>
    new Promise<RemuxStatus>(resolve => {
      const stop = service.onChange(status => {
        if (
          status.sourceId === sourceId &&
          (status.state === 'complete' || status.state === 'failed')
        ) {
          stop();
          resolve(status);
        }
      });
    });
  return {
    root,
    service,
    database,
    storage,
    stored,
    events,
    settled,
    complete,
    removeStorage: (s: Storage) => deleteListener?.(s),
  };
};

const text = async (response: Response) => response.text();

describe('RemuxService', () => {
  it('places segments while a sidecar upload is still open', async () => {
    const { root, service, settled } = await setup();
    const release = join(root, 'release');
    process.env.FAKE_FFMPEG_RELEASE = release;
    const done = settled(1);
    await service.request(1, 'Show/E01.mkv', plan, 'watching');
    // The sidecar is still streaming: every segment is ready all the same.
    for (let tries = 0; service.find(1, 'Show/E01.mkv')?.readySeconds !== 12; tries++) {
      expect(tries).toBeLessThan(200);
      await Bun.sleep(10);
    }
    expect(service.find(1, 'Show/E01.mkv')?.state).toBe('running');
    await writeFile(release, '');
    expect((await done).state).toBe('complete');
  });

  it('builds a remux, stores its files encrypted and serves them', async () => {
    const { root, service, settled, storage } = await setup();
    const done = settled(1);
    const queued = await service.request(1, 'Show/E01.mkv', plan, 'next');
    expect(queued.state).toBe('queued');
    const status = await done;

    expect(status).toMatchObject({ state: 'complete', readySeconds: 12, durationSeconds: 12 });
    expect(status.subtitles).toEqual([
      expect.objectContaining({
        name: 's0.vtt',
        format: 'vtt',
        language: 'eng',
        hearingImpaired: true,
      }),
    ]);
    const playlist = await text(await service.read(1, 'Show/E01.mkv', 'index.m3u8'));
    expect(playlist).toContain('seg00000.ts');
    expect(playlist).toContain('seg00001.ts');
    expect(playlist).toContain('#EXT-X-ENDLIST');
    expect(await text(await service.read(1, 'Show/E01.mkv', 'seg00000.ts'))).toBe(
      'segment 0:source bytes'
    );
    expect(await text(await service.read(1, 'Show/E01.mkv', 's0.vtt'))).toStartWith('WEBVTT');
    const ranged = await service.read(1, 'Show/E01.mkv', 'seg00001.ts', 'bytes=2-4');
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-range')).toBe('bytes 2-4/9');
    expect(await ranged.text()).toBe('gme');
    // Room for the remux was reserved first, and the rest given back: its 10-byte file with
    // headroom, and its converted 5.1 track as 12 s of AC-3 at 640 kbit/s.
    expect(storage.reserveAdditional).toHaveBeenCalledWith(1, 11 + 960_000, false);
    expect(storage.released).toHaveBeenCalledTimes(1);

    // Nothing is stored in the clear, under names that say nothing.
    const dir = join(root, 'source-1', 'remux', '1');
    const names = await readdir(dir);
    expect(names).toHaveLength(3);
    for (const name of names) {
      expect(name).toMatch(/^[0-9a-f]{32}$/);
      expect((await readFile(join(dir, name))).toString()).not.toContain('segment');
    }
  });

  it('fails a remux there is no room for, before writing anything', async () => {
    const { root, service, settled, storage } = await setup();
    storage.reserveAdditional.mockImplementationOnce(async () => {
      throw new Error('Insufficient storage capacity');
    });
    const failed = settled(1);
    await service.request(1, 'Show/E01.mkv', plan, 'watching');
    expect(await failed).toMatchObject({ state: 'failed', error: 'Insufficient storage capacity' });
    expect(storage.reserveAdditional).toHaveBeenCalledWith(1, 11 + 960_000, true);
    expect(await readdir(join(root, 'source-1', 'remux')).catch(() => [])).toEqual([]);
  });

  it('refuses a file that is not stored and a remux that does not exist', async () => {
    const { service } = await setup();
    await expect(service.request(3, 'Show/E01.mkv', plan, 'next')).rejects.toMatchObject({
      status: 'source_file_unavailable',
    });
    await expect(service.read(1, 'Show/E01.mkv', 'index.m3u8')).rejects.toMatchObject({
      status: 'remux_not_found',
    });
    expect(service.find(1, 'Show/E01.mkv')).toBeNull();
  });

  it('fails a remux whose FFmpeg fails, deleting what it wrote, and retries on request', async () => {
    const { root, service, settled } = await setup();
    process.env.FAKE_FFMPEG_EXIT = '1';
    const failed = settled(1);
    await service.request(1, 'Show/E01.mkv', plan, 'next');
    expect(await failed).toMatchObject({ state: 'failed', readySeconds: 0, bytes: 0 });
    expect(await readdir(join(root, 'source-1', 'remux')).catch(() => [])).toEqual([]);

    delete process.env.FAKE_FFMPEG_EXIT;
    const done = settled(1);
    await service.request(1, 'Show/E01.mkv', plan, 'next');
    expect((await done).state).toBe('complete');
  });

  it('fails a remux shorter than its source', async () => {
    const { service, settled } = await setup();
    const failed = settled(1);
    await service.request(1, 'Show/E01.mkv', { ...plan, durationSeconds: 60 }, 'next');
    expect((await failed).error).toContain('lasts 12.0s instead of 60.0s');
  });

  it('waits for the file to finish downloading', async () => {
    const { service, settled, complete } = await setup({ complete: false });
    const done = settled(1);
    await service.request(1, 'Show/E01.mkv', plan, 'next');
    await Bun.sleep(60);
    expect(service.find(1, 'Show/E01.mkv')?.state).toBe('queued');
    complete.value = true;
    expect((await done).state).toBe('complete');
  });

  it('stops a background remux for one a viewer waits for, and runs it again after', async () => {
    const { service, settled, events } = await setup();
    process.env.FAKE_FFMPEG_HANG = '1';
    await service.request(1, 'Show/E01.mkv', plan, 'background');
    while (service.find(1, 'Show/E01.mkv')?.state !== 'running') await Bun.sleep(5);
    delete process.env.FAKE_FFMPEG_HANG;
    const watched = settled(2);
    const background = settled(1);
    await service.request(2, 'Show/E01.mkv', plan, 'watching');
    expect(await watched).toMatchObject({ state: 'complete', priority: 'watching' });
    expect((await background).state).toBe('complete');
    const order = events.filter(event => event.state === 'complete').map(event => event.sourceId);
    expect(order).toEqual([2, 1]);
  });

  it('puts a running remux back in the queue before a shutdown returns', async () => {
    const { service } = await setup();
    process.env.FAKE_FFMPEG_HANG = '1';
    await service.request(1, 'Show/E01.mkv', plan, 'next');
    while (service.find(1, 'Show/E01.mkv')?.state !== 'running') await Bun.sleep(5);
    await service.close();
    // Nothing is left to touch the database once it is closed.
    expect(service.find(1, 'Show/E01.mkv')?.state).toBe('queued');
  });

  it('drops a running remux whose source is removed', async () => {
    const { service, stored, removeStorage, database } = await setup();
    process.env.FAKE_FFMPEG_HANG = '1';
    await service.request(1, 'Show/E01.mkv', plan, 'next');
    while (service.find(1, 'Show/E01.mkv')?.state !== 'running') await Bun.sleep(5);
    database.db.run('DELETE FROM storage WHERE id = ?', [stored[0].id]);
    removeStorage(stored[0]);
    await Bun.sleep(100);
    expect(service.find(1, 'Show/E01.mkv')).toBeNull();
  });
});
