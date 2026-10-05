import type { CacheService } from '@services/cache/cache.service';
import type { DownloadService } from '@services/download/download.service';
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
  downloadService,
  worker,
}: {
  backgroundJobs: BackgroundJobService;
  cacheService: CacheService;
  listService: ListService;
  magnetService: SourceMetadataFileService;
  mediaService: MediaService;
  sourceService: SourceService;
  downloadService: DownloadService;
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
        options: {
          priority: Math.max(20, 90 - plan.listRank * 3 - Math.floor(index / 2)),
        },
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
    run: async ({ movieId, movieMediaId, priority }) => {
      if (!(await sourceService.canRunSourceJobs())) return;
      if (movieMediaId) {
        // Lazy mirror: make sure the local index holds fresh details (imdbId)
        // before searching for sources.
        await mediaService.getMovieByMediaId(movieMediaId);
        await sourceService.processSourceDiscoveryByMediaId(movieMediaId, priority);
      } else if (movieId) {
        await sourceService.processSourceDiscovery(movieId, priority);
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
  worker.register('watchlist.movie.download', {
    concurrency: 1,
    leaseMs: 10 * 60 * 1000,
    run: async ({ movieMediaId }) => {
      const media = await mediaService.getMovieByMediaId(movieMediaId);
      if (!media) return;
      const sources = await sourceService.getSourcesForMovieWithOnDemandSearch(
        {
          id: media.local.id,
          imdbId: media.local.imdbId,
          title: media.local.title,
          contentDirectoriesSearched: media.local.contentDirectoriesSearched,
        },
        3000
      );
      let source = sources
        .filter(candidate => candidate.file)
        .sort((left, right) => (right.streamingScore ?? 0) - (left.streamingScore ?? 0))[0];
      if (!source && sources[0]) {
        await sourceService.processSourceMetadata(sources[0].id);
        source = (await sourceService.getSourcesForMovie(media.local.id))
          .filter(candidate => candidate.file)
          .sort((left, right) => (right.streamingScore ?? 0) - (left.streamingScore ?? 0))[0];
      }
      if (!source) return;
      await downloadService.predownloadSource(source);
    },
  });
  worker.register('cache.cleanup', {
    concurrency: 1,
    run: () => cacheService.cleanup(),
  });
}
