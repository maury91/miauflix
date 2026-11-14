import 'reflect-metadata';

import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';

import type { Database } from '@database/database';
import { MediaProbe } from '@entities/media-probe.entity';
import { MediaVariant } from '@entities/media-variant.entity';
import { EncryptionService } from '@services/encryption/encryption.service';
import { EncryptedColumns } from '@utils/encrypted-column.util';

import { MediaProbeRepository } from './media-probe.repository';
import { MediaVariantRepository } from './media-variant.repository';

const setupTest = async () => {
  EncryptedColumns.configure(new EncryptionService(randomBytes(32).toString('base64')));
  const dataSource = await new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: [MediaProbe, MediaVariant],
    synchronize: true,
  }).initialize();
  const holder: { variants?: MediaVariantRepository } = {};
  const db = {
    getRepository: (entity: typeof MediaVariant) => dataSource.getRepository(entity),
    write: <T>(operation: () => Promise<T>) => operation(),
    transaction: <T>(operation: (manager: unknown) => Promise<T>) =>
      dataSource.transaction(operation),
    getMediaVariantRepository: () => holder.variants!,
  } as unknown as Database;
  const variants = (holder.variants = new MediaVariantRepository(db));
  return { dataSource, variants, probes: new MediaProbeRepository(db) };
};

const probe = {
  format: { format_name: 'matroska,webm' },
  streams: [
    { codec_type: 'video', codec_name: 'hevc' },
    { codec_type: 'audio', codec_name: 'truehd' },
    { codec_type: 'audio', codec_name: 'ac3' },
    { codec_type: 'subtitle', codec_name: 'subrip' },
  ],
};

describe('media versions', () => {
  it('records a probed file as its original, with its codecs', async () => {
    const { dataSource, variants, probes } = await setupTest();
    try {
      await probes.save(7, 'Show/E01.mkv', JSON.stringify(probe));
      expect(await variants.find(7, 'Show/E01.mkv', 'original')).toMatchObject({
        state: 'ready',
        container: 'matroska,webm',
        videoCodec: 'hevc',
        audioCodecs: ['truehd', 'ac3'],
      });
      // Paths are stored encrypted.
      const [row] = await dataSource.query('SELECT k FROM media_variant');
      expect(row.k).not.toContain('Show');
    } finally {
      await dataSource.destroy();
    }
  });

  it('stores no probe without its original version', async () => {
    const { dataSource, variants, probes } = await setupTest();
    try {
      const save = jest.spyOn(variants, 'save').mockRejectedValueOnce(new Error('disk full'));
      await expect(probes.save(7, 'Show/E01.mkv', JSON.stringify(probe))).rejects.toThrow();
      save.mockRestore();
      expect(await probes.find(7, 'Show/E01.mkv')).toBeNull();
    } finally {
      await dataSource.destroy();
    }
  });

  it('keeps a TV version apart from its original, and follows its state', async () => {
    const { dataSource, variants, probes } = await setupTest();
    const remux = { container: 'mpegts', videoCodec: 'hevc', audioCodecs: ['ac3'] };
    try {
      await probes.save(7, 'Show/E01.mkv', JSON.stringify(probe));
      await variants.save(7, 'Show/E01.mkv', 'remux', 'building', remux);
      await variants.save(7, 'Show/E01.mkv', 'remux', 'building', remux);
      expect(await variants.find(7, 'Show/E01.mkv', 'remux')).toMatchObject({
        state: 'building',
        ...remux,
      });
      expect(await variants.setState(7, 'Show/E01.mkv', 'remux', 'ready')).toBe(true);
      expect((await variants.find(7, 'Show/E01.mkv', 'remux'))?.state).toBe('ready');
      expect(await variants.setState(7, 'Show/E02.mkv', 'remux', 'ready')).toBe(false);

      await variants.remove(7, 'Show/E01.mkv', 'remux');
      expect(await variants.find(7, 'Show/E01.mkv', 'remux')).toBeNull();
      expect((await variants.find(7, 'Show/E01.mkv', 'original'))?.audioCodecs).toEqual([
        'truehd',
        'ac3',
      ]);
      expect(await dataSource.getRepository(MediaVariant).count()).toBe(1);
    } finally {
      await dataSource.destroy();
    }
  });
});
