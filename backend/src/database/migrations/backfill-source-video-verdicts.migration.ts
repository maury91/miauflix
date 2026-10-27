import parseTorrent from 'parse-torrent';
import { IsNull, Not } from 'typeorm';

import { ContentSource } from '@entities/content-source.entity';
import { Storage } from '@entities/storage.entity';
import { containsPlayableVideo } from '@services/download/download.utils';

import type { Migration } from './migration.types';

/**
 * Judge every source whose file list is already known (a resolved storage layout or a stored
 * torrent file), so fakes found before verdicts were stored are never picked again.
 */
export const backfillSourceVideoVerdicts: Migration = async ({ db, logger }) => {
  const repository = db.getContentSourceRepository();
  const judged = new Set<number>();
  let fakes = 0;

  const storages = await db
    .getRepository(Storage)
    .find({ where: { encryptedLayout: Not(IsNull()) }, select: ['sourceId', 'encryptedLayout'] });
  for (const storage of storages) {
    const files = storage.encryptedLayout?.files;
    if (!files?.length) continue;
    const hasVideo = containsPlayableVideo(files);
    await repository.setHasVideo(storage.sourceId, hasVideo);
    judged.add(storage.sourceId);
    if (!hasVideo) fakes++;
  }

  const withFiles = await db.getRepository(ContentSource).find({
    where: { file: Not(IsNull()), hasVideo: IsNull() },
    select: ['id', 'file'],
  });
  for (const source of withFiles) {
    if (judged.has(source.id) || !source.file) continue;
    try {
      const files = (await parseTorrent(source.file)).files ?? [];
      if (!files.length) continue;
      const hasVideo = containsPlayableVideo(files);
      await repository.setHasVideo(source.id, hasVideo);
      judged.add(source.id);
      if (!hasVideo) fakes++;
    } catch {
      // An unreadable torrent file stays unjudged; playback judges the source later.
    }
  }

  if (judged.size)
    logger.info(
      'Migrations',
      `Judged ${judged.size} sources from known file lists (${fakes} fake)`
    );
};
