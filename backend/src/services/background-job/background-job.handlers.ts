import { playableFromKey } from '@routes/playable.types';
import type { CacheService } from '@services/cache/cache.service';
import type { DownloadService } from '@services/download/download.service';
import type { ListClientService } from '@services/list/list-client.service';
import type { ListService } from '@services/media/list.service';
import type { MediaService } from '@services/media/media.service';
import type { NotificationService } from '@services/notifications/notification.service';
import type { PlaybackTargetService } from '@services/playback/playback-target.service';
import type { ProgressService } from '@services/progress/progress.service';
import type { SourceMetadataFileService } from '@services/source';
import type { SourceService } from '@services/source/source.service';

import type { BackgroundJobService } from './background-job.service';
import type { BackgroundJobWorker } from './background-job.worker';

const AVAILABILITY_CHECK_PAGE_SIZE = 50;

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
  listClient,
  magnetService,
  mediaService,
  notificationService,
  sourceService,
  downloadService,
  progressService,
  playbackTargets,
  worker,
}: {
  backgroundJobs: BackgroundJobService;
  cacheService: CacheService;
  listService: ListService;
  listClient: ListClientService;
  magnetService: SourceMetadataFileService;
  mediaService: MediaService;
  notificationService?: Pick<NotificationService, 'requestedPlayableKeys'>;
  sourceService: SourceService;
  downloadService: DownloadService;
  progressService: ProgressService;
  playbackTargets: Pick<PlaybackTargetService, 'forEpisode' | 'forMovie'>;
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
  worker.register('source.verify', {
    concurrency: 1,
    leaseMs: 5 * 60 * 1000,
    run: async ({ sourceId, movieId }) => {
      if (!(await sourceService.canRunSourceJobs())) return;
      if (movieId) await sourceService.verifyMovieSources(movieId);
      else if (sourceId) await sourceService.verifySource(sourceId);
    },
  });
  worker.register('availability.check', {
    concurrency: 1,
    leaseMs: 10 * 60 * 1000,
    run: async () => {
      if (!notificationService || !(await sourceService.canRunSourceJobs())) return;
      // Collect every pending key first: fulfilled requests are deleted while checking.
      const keys: string[] = [];
      for (let page: string[]; ; ) {
        page = await notificationService.requestedPlayableKeys(
          AVAILABILITY_CHECK_PAGE_SIZE,
          keys.length
        );
        keys.push(...page);
        if (page.length < AVAILABILITY_CHECK_PAGE_SIZE) break;
      }
      for (const key of keys) {
        const playable = playableFromKey(key);
        if (!playable) continue;
        if (playable.kind === 'movie') {
          const media = await mediaService.getMovieByMediaId(playable.mediaId);
          if (!media) continue;
          await sourceService.processSourceDiscovery(media.local.id);
          sourceService.requestMovieVerification(media.local.id);
          continue;
        }
        const show = await mediaService.getTVShowByMediaId(playable.showMediaId);
        const season = show
          ? await mediaService.getSeason(playable.showMediaId, playable.seasonNumber)
          : null;
        const episode = season?.episodes.find(
          item => item.episodeNumber === playable.episodeNumber
        );
        if (!show || !episode) continue;
        // A real match notifies. Matching skips verification when a single-file match already
        // exists, so queue unverified matches here as well (already-verified ones are ignored).
        const associations = await sourceService.getSourcesForEpisodeWithOnDemandSearch({
          episodeId: episode.id,
          showMediaId: show.local.mediaId,
          showTitle: show.local.name,
          showImdbId: show.local.imdbId ?? null,
          seasonNumber: playable.seasonNumber,
          episodeNumber: playable.episodeNumber,
          airDate: episode.airDate,
        });
        sourceService.requestSourceVerification(associations.map(({ source }) => source));
      }
    },
  });
  worker.register('watchlist.movie.download', {
    concurrency: 1,
    leaseMs: 10 * 60 * 1000,
    run: async ({ movieMediaId }) => {
      if (!(await listService.hasAnyMovieWatchlistInterest(movieMediaId))) return;
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
      // Known fakes never become background downloads.
      let source = sources
        .filter(candidate => candidate.file && candidate.hasVideo !== false)
        .sort((left, right) => (right.streamingScore ?? 0) - (left.streamingScore ?? 0))[0];
      if (!source && sources[0]) {
        await sourceService.processSourceMetadata(sources[0].id);
        source = (await sourceService.getSourcesForMovie(media.local.id))
          .filter(candidate => candidate.file && candidate.hasVideo !== false)
          .sort((left, right) => (right.streamingScore ?? 0) - (left.streamingScore ?? 0))[0];
      }
      if (!source) {
        if (sourceService.isOnDemandSearchPending(media.local.id))
          throw new Error('Watchlist source discovery is still pending');
        return;
      }
      // Re-check after source discovery and after the settling delay. A removal
      // during discovery must never turn into a new background download.
      if (!(await listService.hasAnyMovieWatchlistInterest(movieMediaId))) return;
      await downloadService.predownload(await playbackTargets.forMovie(media.local.id, source), {
        kind: 'watchlist',
        ownerKey: `watchlist:movie:${movieMediaId}`,
        ttlMs: null,
      });
    },
  });
  worker.register('watchlist.tv.scan', {
    concurrency: 1,
    leaseMs: 2 * 60 * 1000,
    run: async () => {
      const interests = await listService.getLocalTVWatchlistInterests();
      const prioritized = await Promise.all(
        interests.map(async ({ mediaId, ownerCount }) => {
          const owners = await listService.getLocalTVWatchlistOwners(mediaId);
          const progress = await progressService.findEpisodeProgressForShow(mediaId, owners);
          const mostRecent = progress[0]?.updatedAt.getTime() ?? 0;
          const age = mostRecent ? Date.now() - mostRecent : Number.POSITIVE_INFINITY;
          const recentInterest =
            age < 86_400_000 ? 30 : age < 7 * 86_400_000 ? 20 : age < 30 * 86_400_000 ? 10 : 0;
          return {
            type: 'watchlist.tv.acquire' as const,
            dedupeKey: `watchlist:tv:${mediaId}`,
            payload: { showMediaId: mediaId },
            options: { priority: Math.min(95, 35 + ownerCount * 5 + recentInterest) },
          };
        })
      );
      await backgroundJobs.enqueueBulk(
        prioritized.map(({ type, dedupeKey, payload, options }) => ({
          type,
          dedupeKey,
          payload,
          options,
        }))
      );
    },
  });
  worker.register('watchlist.tv.acquire', {
    concurrency: 1,
    leaseMs: 10 * 60 * 1000,
    run: async ({ showMediaId }) => {
      const owners = await listService.getLocalTVWatchlistOwners(showMediaId);
      if (!owners.length) return;
      const show = await mediaService.getTVShowByMediaId(showMediaId);
      if (!show) return;
      const progress = await progressService.findEpisodeProgressForShow(showMediaId, owners);
      const episodes: Array<{
        id: number;
        seasonNumber: number;
        episodeNumber: number;
        airDate: string | null;
      }> = [];
      for (const seasonSummary of show.detail.seasons
        .filter(season => season.seasonNumber > 0)
        .sort((left, right) => left.seasonNumber - right.seasonNumber)) {
        const season = await mediaService.getSeason(showMediaId, seasonSummary.seasonNumber);
        for (const episode of season?.episodes ?? []) {
          episodes.push({
            id: episode.id,
            seasonNumber: seasonSummary.seasonNumber,
            episodeNumber: episode.episodeNumber,
            airDate: episode.airDate,
          });
        }
      }
      episodes.sort(
        (left, right) =>
          left.seasonNumber - right.seasonNumber || left.episodeNumber - right.episodeNumber
      );
      if (!episodes.length) return;

      const episodeIndex = new Map(
        episodes.map((episode, index) => [
          `${episode.seasonNumber}:${episode.episodeNumber}`,
          index,
        ])
      );
      const latest = progress[0];
      const lastWatched = latest ? playableFromKey(latest.playableKey) : null;
      const lastWatchedIndex =
        lastWatched?.kind === 'episode'
          ? episodeIndex.get(`${lastWatched.seasonNumber}:${lastWatched.episodeNumber}`)
          : undefined;
      const startAt =
        lastWatchedIndex === undefined
          ? 0
          : latest?.state === 'completed'
            ? lastWatchedIndex + 1
            : lastWatchedIndex;

      const candidates = episodes.slice(startAt);
      for (const [offset, episode] of candidates.entries()) {
        if (!(await listService.hasAnyTVWatchlistInterest(showMediaId))) return;
        const airTime = episode.airDate ? Date.parse(episode.airDate) : NaN;
        if (!Number.isFinite(airTime)) continue;
        const now = Date.now();
        // Unaired episodes are searched once they enter the configured LEAK_TOLERANCE window.
        if (!sourceService.isEpisodeWithinLeakTolerance(episode.airDate, now)) return;
        // Always keep the immediate next episode eligible. Beyond that, background
        // acquisition follows recent releases instead of filling old back catalogs.
        if (offset > 0 && now - airTime > 45 * 86_400_000) return;
        const matches = await sourceService.getSourcesForEpisodeWithOnDemandSearch({
          episodeId: episode.id,
          showMediaId,
          showTitle: show.local.name,
          showImdbId: show.local.imdbId ?? null,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          airDate: episode.airDate,
        });
        const allUsable = matches
          .filter(match => match.videoFilePath)
          .sort(
            (left, right) => (right.source.streamingScore ?? 0) - (left.source.streamingScore ?? 0)
          );
        const exactMatches = allUsable.filter(match => match.matchKind === 'single');
        const usable = exactMatches.length ? exactMatches : allUsable;
        if (!usable.length) return;
        const completeFlags = await Promise.all(
          usable.map(match => downloadService.isFileComplete(match.source.id, match.videoFilePath!))
        );
        const completeMatch = usable.find((_, index) => completeFlags[index]);
        if (completeMatch) {
          // Renew the claim so storage cleanup does not reclaim the completed file.
          await downloadService.predownload((await playbackTargets.forEpisode(completeMatch))!, {
            kind: 'watchlist',
            ownerKey: `watchlist:tv:${showMediaId}`,
          });
          continue;
        }

        const selected = usable[0];
        try {
          // Each scan renews the claim; it lapses once the show leaves every watchlist.
          await downloadService.predownload((await playbackTargets.forEpisode(selected))!, {
            kind: 'watchlist',
            ownerKey: `watchlist:tv:${showMediaId}`,
          });
        } catch (error) {
          if (error instanceof Error && /insufficient .* capacity/i.test(error.message)) return;
          throw error;
        }
        return;
      }
    },
  });
  worker.register('watchlist.sync', {
    concurrency: 2,
    leaseMs: 2 * 60 * 1000,
    run: async ({ subjectId, mediaType, mediaId }) => {
      if (!listClient.isReady()) throw new Error('List service is not ready');
      const inWatchlist = await listService.getWatchlistMembership(subjectId, mediaType, mediaId);
      await listClient.syncWatchlist(subjectId, {
        mediaType,
        mediaId,
        operation: inWatchlist ? 'add' : 'remove',
      });
    },
  });
  worker.register('cache.cleanup', {
    concurrency: 1,
    run: () => cacheService.cleanup(),
  });
}
