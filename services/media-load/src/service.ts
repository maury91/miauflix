import { defineService, type Service } from '@miauflix/contract';
import { mediaLoad } from '@miauflix/service-contracts';

import { MediaLoadConfigService } from './config/config.service';
import { ScrapeBatcher, type ScrapeBatcherOptions, ScrapeError } from './scrape/scrape-batcher';

export interface MediaLoadServiceOptions {
  /** Scrape timing, for tests. */
  scrape?: ScrapeBatcherOptions;
}

export function createMediaLoadService(options: MediaLoadServiceOptions = {}): {
  service: Service;
  stop: () => Promise<void>;
} {
  const config = new MediaLoadConfigService();
  let scrapes: { trackers: string; batcher: ScrapeBatcher } | null = null;

  /** The batcher for the applied trackers; a tracker change starts a new one. */
  const batcher = (): ScrapeBatcher => {
    const trackers = config.list('SCRAPE_TRACKERS');
    const key = trackers.join(',');
    if (scrapes?.trackers !== key) {
      scrapes?.batcher.close();
      scrapes = { trackers: key, batcher: new ScrapeBatcher(trackers, options.scrape) };
    }
    return scrapes.batcher;
  };

  config.registerProber({
    // No network check: a tracker being down is normal, and the others still answer.
    test: async values => {
      const usable = (values.SCRAPE_TRACKERS || config.value('SCRAPE_TRACKERS'))
        .split(',')
        .map(item => item.trim())
        .filter(url => /^(udp|https?):\/\//.test(url));
      return {
        success: true,
        message: usable.length
          ? `${usable.length} scrape tracker(s)`
          : 'No UDP or HTTP scrape trackers: swarm stats are unavailable',
      };
    },
  });

  const service = defineService({
    info: {
      id: 'media-load',
      name: 'Media load',
      description: 'Torrent engine',
      version: '0.1.0',
    },
    configuration: config,
    status: () => ({
      state: config.ready ? 'ready' : 'standby',
      missingConfiguration: config.missingVars(),
      details: { scrapes: scrapes?.batcher.stats ?? null },
    }),
    onStop: async () => {
      scrapes?.batcher.close();
      scrapes = null;
    },
  }).implement(mediaLoad, {
    swarmStats: async ({ hash }, ctx) => {
      if (typeof hash !== 'string') return ctx.fail('invalid_hash', 'hash must be a string');
      try {
        return await batcher().scrape(hash);
      } catch (error) {
        if (error instanceof ScrapeError) return ctx.fail(error.code, error.message);
        throw error;
      }
    },
  });
  return { service, stop: () => service.stop() };
}
