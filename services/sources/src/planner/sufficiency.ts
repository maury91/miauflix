import type { SourceCandidate, SourceSearchRequest } from '@miauflix/service-contracts';
export function isSufficient(
  request: SourceSearchRequest,
  candidates: SourceCandidate[],
  cfg: { minSeeders: number; movieMinHealthy: number }
): boolean {
  const healthy = candidates.filter(c => c.broadcasters >= cfg.minSeeders || c.release === 'best');
  if (request.media.kind === 'movie')
    return (
      (healthy.length >= cfg.movieMinHealthy &&
        healthy.some(c => /FHD|4K|1080|2160/i.test(c.quality ?? ''))) ||
      new Set(candidates.filter(c => c.matchedBy !== 'title').map(c => c.provider)).size >= 2
    );
  return healthy.some(
    c => c.season === request.season && (c.episode === request.episode || c.batch)
  );
}
