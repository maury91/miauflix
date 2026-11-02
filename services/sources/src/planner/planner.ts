import type {
  SourceCandidate,
  SourceSearchItem,
  SourceSearchRequest,
} from '@miauflix/service-contracts';

import type { SourcesConfigService } from '../config/config.service';
import { BudgetExceeded, type Store } from '../db/store';
import { HttpClient, RateLimitError } from '../http/http-client';
import { mergeCandidate, toCandidate } from '../normalize/candidate';
import type { Registry } from '../providers/registry';
import type { Provider } from '../providers/types';
import { SingleFlight } from '../util/single-flight';
import { variantsFor } from './query-variants';
import { isSufficient } from './sufficiency';
export class Planner {
  private flights = new SingleFlight();
  constructor(
    private store: Store,
    private registry: Registry,
    private config: SourcesConfigService,
    private http: HttpClient,
    private now = Date.now
  ) {}
  async *search(
    request: SourceSearchRequest,
    signal: AbortSignal
  ): AsyncGenerator<SourceSearchItem> {
    const all = await this.registry.providers();
    const kind = request.media.kind === 'movie' ? 'movie' : 'tv';
    const providers = all.filter(
      p => p.caps[kind].length || (request.media.isAnime && p.caps.anime.length)
    );
    const seen = new Map<string, SourceCandidate>();
    const searched = new Set<string>(),
      failed = new Set<string>(),
      skipped = new Set<string>();
    const retryTimes: number[] = [];
    const memoryKey = `${request.media.kind === 'movie' ? 'movie' : 'tv'}:${request.media.tmdbId}${kind === 'tv' ? `:s${request.season}:e${request.episode}` : ''}`;
    const ttl =
      kind === 'movie'
        ? 12 * 3600_000
        : request.airDate && this.now() - Date.parse(request.airDate) < 7 * 86400_000
          ? 1800_000
          : 86400_000;
    const sufficient = () =>
      isSufficient(request, [...seen.values()], {
        minSeeders: this.config.number('SOURCES_MIN_SEEDERS'),
        movieMinHealthy: this.config.number('SOURCES_MOVIE_MIN_HEALTHY'),
      });
    const queue: SourceCandidate[] = [];
    let wake: (() => void) | undefined;
    const emit = (c: SourceCandidate) => {
      const previous = seen.get(c.hash);
      const priority = (id: string) =>
        this.store.providers().find(p => p.id === id)?.priority ?? Infinity;
      const merged = previous
        ? priority(c.provider) < priority(previous.provider)
          ? mergeCandidate(c, previous)
          : mergeCandidate(previous, c)
        : c;
      seen.set(c.hash, merged);
      queue.push(merged);
      wake?.();
    };
    const run = async (provider: Provider) => {
      const row = this.store.providers().find(r => r.id === provider.id)!;
      const memory = this.store.memory(memoryKey, provider.id);
      if (
        (row.cooldown_until ?? 0) > this.now() ||
        (provider.requiresFlareSolverr && !this.config.value('FLARESOLVERR_URL')) ||
        (request.skipProviders?.includes(provider.id) &&
          memory &&
          memory.searched_at + ttl > this.now())
      ) {
        skipped.add(provider.id);
        if ((row.cooldown_until ?? 0) > this.now()) retryTimes.push(row.cooldown_until!);
        return;
      }
      let count = 0;
      try {
        for (const variant of variantsFor(provider, request)) {
          for (
            let page = 1;
            page <= (provider.caps[variant.query.kind].includes('page') ? provider.maxPages : 1);
            page++
          ) {
            signal.throwIfAborted();
            if (sufficient()) break;
            const query = {
              ...variant.query,
              ...(provider.caps[variant.query.kind].includes('page') ? { page } : {}),
            };
            const key = JSON.stringify(query);
            const cached = this.store.cache(provider.id, key);
            const result =
              cached ??
              (await this.flights.runCancelable(
                `${provider.id}:${request.purpose}:${key}`,
                signal,
                async sharedSignal => {
                  const beforeRequest = () => {
                    sharedSignal.throwIfAborted();
                    this.store.reserve(provider.id, provider.rate.dailyBudget, request.purpose);
                  };
                  const scoped = Object.create(this.http) as HttpClient;
                  scoped.request = (url, options = {}) =>
                    this.http.request(url, {
                      ...options,
                      ...provider.rate,
                      signal: sharedSignal,
                      beforeRequest,
                      maxRateWaitMs: request.purpose === 'interactive' ? 1000 : 0,
                    });
                  const result = await provider.search(query, {
                    signal: sharedSignal,
                    http: scoped,
                  });
                  this.store.putCache(
                    provider.id,
                    key,
                    result,
                    result.results.length ? ttl : 2 * 3600_000
                  );
                  return result;
                }
              ));
            const candidates = result.results
              .map(raw =>
                toCandidate(raw, provider, variant.matchedBy, query, request, this.store.seal)
              )
              .filter((c): c is SourceCandidate => c !== null);
            const hasMore = result.hasMore;
            for (const c of candidates) {
              count++;
              emit(c);
            }
            if (!hasMore) break;
          }
          if (sufficient()) break;
        }
        searched.add(provider.id);
        this.store.remember(memoryKey, provider.id, count);
        this.store.success(provider.id);
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof BudgetExceeded || error instanceof RateLimitError) {
          skipped.add(provider.id);
          retryTimes.push(
            error instanceof RateLimitError
              ? error.retryAt
              : Date.parse(this.store.day()) + 86400_000
          );
        } else {
          failed.add(provider.id);
          this.store.failure(provider.id, error);
        }
      }
    };
    const tiers = new Map<number, Provider[]>();
    for (const p of providers) {
      const priority = this.store.providers().find(r => r.id === p.id)!.priority;
      const key = Math.floor(priority / 10);
      tiers.set(key, [...(tiers.get(key) ?? []), p]);
    }
    for (const tier of tiers.values())
      tier.sort(
        (a, b) =>
          Number(b.caps[kind].some(p => ['imdbid', 'tmdbid', 'tvdbid'].includes(p))) -
          Number(a.caps[kind].some(p => ['imdbid', 'tmdbid', 'tvdbid'].includes(p)))
      );
    if (request.purpose === 'background') {
      for (const tier of tiers.values()) {
        tier.sort((a, b) => {
          const ratio = (p: Provider) =>
            p.rate.dailyBudget === null ? 1 : 1 - this.store.usage(p.id) / p.rate.dailyBudget;
          return (
            ratio(b) - ratio(a) ||
            (this.store.providers().find(r => r.id === a.id)!.last_used_at ?? 0) -
              (this.store.providers().find(r => r.id === b.id)!.last_used_at ?? 0)
          );
        });
        for (const p of tier) {
          if (signal.aborted || sufficient()) break;
          await run(p);
          while (queue.length) yield { type: 'candidate', candidate: queue.shift()! };
        }
        if (signal.aborted || sufficient()) break;
      }
    } else {
      const groups = [...tiers.values()];
      let index = 0;
      const running = new Set<Promise<void>>();
      let next = this.now();
      try {
        while (!signal.aborted && (index < groups.length || running.size)) {
          if (
            index < groups.length &&
            !sufficient() &&
            (this.now() >= next || running.size === 0)
          ) {
            for (const p of groups[index++]) {
              const task = run(p).finally(() => {
                running.delete(task);
                wake?.();
              });
              running.add(task);
            }
            next = this.now() + this.config.number('SOURCES_HEDGE_MS');
          }
          while (queue.length) yield { type: 'candidate', candidate: queue.shift()! };
          if (!running.size && (sufficient() || index === groups.length)) break;
          await new Promise<void>(resolve => {
            const timer = setTimeout(
              done,
              Math.max(1, index < groups.length && !sufficient() ? next - this.now() : 1000)
            );
            function done() {
              clearTimeout(timer);
              signal.removeEventListener('abort', done);
              resolve();
            }
            wake = done;
            signal.addEventListener('abort', done, { once: true });
          });
        }
      } finally {
        await Promise.allSettled(running);
      }
      while (queue.length) yield { type: 'candidate', candidate: queue.shift()! };
    }
    const complete = providers.every(
      p =>
        searched.has(p.id) ||
        (this.store.memory(memoryKey, p.id)?.searched_at ?? 0) + ttl > this.now()
    );
    let retryAfter: string | null = null;
    if (request.purpose === 'background') {
      const recent =
        kind === 'movie'
          ? request.media.releaseDate
            ? this.now() - Date.parse(request.media.releaseDate) < 90 * 86400_000
            : !!request.media.year && request.media.year >= new Date(this.now()).getUTCFullYear()
          : !!request.airDate && this.now() - Date.parse(request.airDate) < 14 * 86400_000;
      let retry =
        this.now() +
        (kind === 'movie'
          ? recent
            ? 6 * 3600_000
            : 7 * 86400_000
          : recent
            ? 2 * 3600_000
            : 3 * 86400_000);
      if (retryTimes.length) retry = Math.min(retry, ...retryTimes);
      retryAfter = new Date(retry).toISOString();
    }
    yield {
      type: 'summary',
      providersSearched: [...searched],
      providersFailed: [...failed],
      providersSkipped: [...skipped],
      complete,
      retryAfter,
    };
  }
}
