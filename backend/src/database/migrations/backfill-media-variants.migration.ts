import { probeCodecs } from '@repositories/media-variant.repository';

import type { Migration } from './migration.types';

/**
 * Record every probed file as its source's original version, with its codecs. TV versions are
 * recorded as they are requested or reported by media-load.
 */
export const backfillMediaVariants: Migration = async ({ db, logger }) => {
  const variants = db.getMediaVariantRepository();
  let recorded = 0;
  for (const probe of await db.getMediaProbeRepository().all()) {
    let parsed: Parameters<typeof probeCodecs>[0];
    try {
      parsed = JSON.parse(probe.result);
    } catch {
      continue;
    }
    // A failed write fails the migration, so it runs again at the next start.
    await variants.save(probe.sourceId, probe.filePath, 'original', 'ready', probeCodecs(parsed));
    recorded++;
  }
  if (recorded) logger.info('Migrations', `Recorded ${recorded} original media versions`);
};
