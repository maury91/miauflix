import type { CacheService } from '@services/cache/cache.service';
import type { ListService } from '@services/media/list.service';
import type { MediaService } from '@services/media/media.service';
import type { SourceMetadataFileService } from '@services/source';
import type { SourceService } from '@services/source/source.service';

import type { BackgroundJobService } from './background-job.service';
import type { BackgroundJobWorker } from './background-job.worker';

/**
 * Handler registration for the backend-owned queues. Catalog maintenance
 * (hydration, change scans, season sync) is consumed by the media-catalog
 * service directly from the shared broker — see
 * services/media-catalog/src/workers/.
 */
export function registerBackgroundJobHandlers({
  backgroundJobs,
  cacheService,
  listService,
  magnetService,
  mediaService,
  sourceService,
  worker,
}: {
  backgroundJobs: BackgroundJobService;
  cacheService: CacheService;
  listService: ListService;
  magnetService: SourceMetadataFileService;
  mediaService: MediaService;
  sourceService: SourceService;
  worker: BackgroundJobWorker;
}): void {
  worker.register('list.refresh.plan', {
    concurrency: 1,
    leaseMs: 2 * 60 * 1000,
    run: async ({ maxPages, slug, subjectId }) => {
      const plan = await listService.createRefreshPlan(slug, maxPages, subjectId);
      const pages = Array.from({ length: plan.pageCount }, (_, index) => ({
        type: 'list.page.stage' as const,
        dedupeKey: `${plan.generation}:${index + 1}`,
        payload: {
          slug,
          listId: plan.listId,
          generation: plan.generation,
          page: index + 1,
          pageSize: plan.pageSize,
          subjectId,
        },
        options: { priority: 60 },
      }));
      if (!pages.length) {
        await listService.activateRefreshGeneration(plan.listId, plan.generation);
        return;
      }
      await backgroundJobs.addFanIn(pages, {
        type: 'list.generation.activate',
        dedupeKey: plan.generation,
        payload: { listId: plan.listId, generation: plan.generation },
        options: { priority: 70 },
      });
    },
  });
  worker.register('list.page.stage', {
    concurrency: 3,
    leaseMs: 3 * 60 * 1000,
    run: payload =>
      listService.stageRefreshPage(
        payload.slug,
        payload.listId,
        payload.generation,
        payload.page,
        payload.pageSize,
        payload.subjectId
      ),
  });
  worker.register('list.generation.activate', {
    concurrency: 1,
    run: ({ generation, listId }) => listService.activateRefreshGeneration(listId, generation),
  });
  worker.register('source.discover', {
    concurrency: 1,
    leaseMs: 2 * 60 * 1000,
    run: async ({ movieId, movieMediaId }) => {
      if (!(await sourceService.canRunSourceJobs())) return;
      if (movieMediaId) {
        // Lazy mirror: make sure the local index holds fresh details (imdbId)
        // before searching for sources.
        await mediaService.getMovieByMediaId(movieMediaId);
        await sourceService.processSourceDiscoveryByMediaId(movieMediaId);
      } else if (movieId) {
        await sourceService.processSourceDiscovery(movieId);
      } else {
        await sourceService.seedSourceDiscoveryJobs();
      }
    },
  });
  worker.register('source.metadata', {
    concurrency: Math.max(1, magnetService.getAvailableConcurrency()),
    leaseMs: 2 * 60 * 1000,
    run: async ({ sourceId }) => {
      if (!(await sourceService.canRunMetadataJobs())) return;
      if (sourceId) await sourceService.processSourceMetadata(sourceId);
      else await sourceService.seedSourceMetadataJobs();
    },
  });
  worker.register('source.stats', {
    concurrency: 5,
    leaseMs: 60_000,
    run: async ({ sourceId }) => {
      if (!(await sourceService.canRunSourceJobs())) return;
      if (sourceId) await sourceService.processSourceStats(sourceId);
      else await sourceService.seedSourceStatsJobs();
    },
  });
  worker.register('cache.cleanup', {
    concurrency: 1,
    run: () => cacheService.cleanup(),
  });
}
