import { logger } from '@logger';
import type { EntityManager } from 'typeorm';
import { In } from 'typeorm';

import type { Database } from '@database/database';
import { AvailabilityRequest } from '@entities/availability-request.entity';
import { Episode } from '@entities/episode.entity';
import { Notification } from '@entities/notification.entity';
import { PlaybackGrant } from '@entities/playback-grant.entity';
import { Progress } from '@entities/progress.entity';
import { Season } from '@entities/season.entity';
import { TVShow } from '@entities/tvshow.entity';
import type { EpisodeLayout, TVShowDetail } from '@services/catalog/catalog.types';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';

const SCOPE = 'EpisodeRenumber';
/** Prefix of the key a row is parked at while keys move, so a chain of moves never collides. */
const PARKED = '~';

type Numbers = { season: number; episode: number };
const key = (show: number, { season, episode }: Numbers) => `e:${show}:${season}:${episode}`;

/**
 * Keeps the local seasons and episodes of a show in the catalog's numbering. When the catalog
 * starts (or stops) numbering an anime by AniList entry, its episodes move to their new seasons
 * and numbers (keeping their sources), and everything stored by episode number moves with them:
 * progress, availability requests, playback grants and notifications.
 */
export class EpisodeRenumberService {
  constructor(
    private readonly db: Database,
    private readonly catalogClient: CatalogClientService
  ) {}

  /**
   * Renumbers the show when its stored layout differs from the catalog's. Runs after the show's
   * details (and season summaries) are mirrored. Returns the layout version now stored.
   */
  async reconcile(show: TVShow, detail: TVShowDetail): Promise<string | null> {
    // A catalog that predates season layouts reports none: nothing to compare.
    if (detail.seasonLayoutVersion === undefined) return show.seasonLayoutVersion;
    const target = detail.seasonLayoutVersion;
    if (show.seasonLayoutVersion === target) return target;
    const layout = target ? await this.catalogClient.getEpisodeLayout(show.mediaId) : null;
    if (target && !layout) return show.seasonLayoutVersion;
    return this.db.transaction(manager => this.apply(manager, show.id, detail, layout));
  }

  private async apply(
    manager: EntityManager,
    showId: number,
    detail: TVShowDetail,
    layout: EpisodeLayout | null
  ): Promise<string | null> {
    const show = await manager.getRepository(TVShow).findOneByOrFail({ id: showId });
    const version = layout?.layout === 'anilist' ? layout.version : null;
    // Another request renumbered it first.
    if (show.seasonLayoutVersion === version) return version;
    const tv = show.mediaId;
    const seasonRepo = manager.getRepository(Season);
    const episodeRepo = manager.getRepository(Episode);
    const seasons = await seasonRepo.findBy({ tvShowId: showId });
    const seasonNumberById = new Map(seasons.map(season => [season.id, season.seasonNumber]));
    const regular = seasons.filter(season => season.seasonNumber > 0);
    const episodes = regular.length
      ? await episodeRepo.findBy({ seasonId: In(regular.map(season => season.id)) })
      : [];
    const byMediaId = new Map(
      (version ? layout!.episodes : []).map(entry => [entry.mediaId, entry])
    );

    /** Old key → new numbers, for everything stored by episode number. */
    const moves = new Map<string, Numbers>();
    const updates: Array<{ episode: Episode; to: Numbers; provider: Numbers | null }> = [];
    const stale: number[] = [];
    for (const episode of episodes) {
      const from = {
        season: seasonNumberById.get(episode.seasonId)!,
        episode: episode.episodeNumber,
      };
      let to: Numbers;
      let provider: Numbers | null;
      if (version) {
        const entry = byMediaId.get(episode.mediaId);
        // TMDB no longer lists it; its place may belong to another episode now.
        if (!entry) {
          stale.push(episode.id);
          continue;
        }
        to = { season: entry.seasonNumber, episode: entry.episodeNumber };
        provider = { season: entry.providerSeasonNumber, episode: entry.providerEpisodeNumber };
      } else {
        to = {
          season: episode.providerSeasonNumber ?? from.season,
          episode: episode.providerEpisodeNumber ?? from.episode,
        };
        provider = null;
      }
      if (to.season !== from.season || to.episode !== from.episode) moves.set(key(tv, from), to);
      updates.push({ episode, to, provider });
    }
    // Coming from TMDB's numbering, episodes not mirrored yet still have keys at TMDB's numbers.
    if (version && !show.seasonLayoutVersion)
      for (const entry of layout!.episodes) {
        const from = { season: entry.providerSeasonNumber, episode: entry.providerEpisodeNumber };
        const oldKey = key(tv, from);
        if (
          !moves.has(oldKey) &&
          (from.season !== entry.seasonNumber || from.episode !== entry.episodeNumber)
        )
          moves.set(oldKey, { season: entry.seasonNumber, episode: entry.episodeNumber });
      }

    if (stale.length) await episodeRepo.delete({ id: In(stale) });
    const seasonIds = await this.targetSeasons(manager, show, detail, seasons, updates);
    // Park every episode first: (season, episode number) is unique and moves can form chains.
    for (const { episode } of updates)
      await episodeRepo.update(episode.id, { episodeNumber: -episode.id });
    for (const { episode, to, provider } of updates)
      await episodeRepo.update(episode.id, {
        seasonId: seasonIds.get(to.season)!,
        episodeNumber: to.episode,
        providerSeasonNumber: provider?.season ?? null,
        providerEpisodeNumber: provider?.episode ?? null,
      });
    await this.dropEmptySeasons(manager, showId, detail);
    await this.moveKeys(manager, tv, moves);
    await manager.getRepository(TVShow).update(showId, { seasonLayoutVersion: version });
    logger.info(
      SCOPE,
      `Show ${tv} renumbered to ${version ? `AniList layout ${version}` : 'TMDB seasons'}: ${moves.size} episodes moved`
    );
    return version;
  }

  /** The local season row of every target season number, created when missing. */
  private async targetSeasons(
    manager: EntityManager,
    show: TVShow,
    detail: TVShowDetail,
    seasons: Season[],
    updates: Array<{ to: Numbers }>
  ): Promise<Map<number, number>> {
    const seasonRepo = manager.getRepository(Season);
    const ids = new Map(seasons.map(season => [season.seasonNumber, season.id]));
    const targets = new Set(updates.map(update => update.to.season));
    for (const number of targets) {
      if (ids.has(number)) continue;
      const summary = detail.seasons.find(season => season.seasonNumber === number);
      const created = await seasonRepo.save(
        seasonRepo.create({
          mediaId: summary?.mediaId ?? 0,
          tvShowId: show.id,
          seasonNumber: number,
          name: summary?.name ?? `Season ${number}`,
          overview: summary?.overview ?? '',
          airDate: summary?.airDate ?? undefined,
          posterPath: summary?.poster ?? undefined,
        })
      );
      ids.set(number, created.id);
    }
    // Their episode lists changed: the next season read mirrors them again.
    if (targets.size)
      await seasonRepo.update(
        { id: In([...targets].map(number => ids.get(number)!)) },
        { synced: false }
      );
    return ids;
  }

  /** Regular seasons the catalog no longer lists and that no episode is left in. */
  private async dropEmptySeasons(
    manager: EntityManager,
    showId: number,
    detail: TVShowDetail
  ): Promise<void> {
    const listed = new Set(detail.seasons.map(season => season.seasonNumber));
    const seasonRepo = manager.getRepository(Season);
    const episodeRepo = manager.getRepository(Episode);
    for (const season of await seasonRepo.findBy({ tvShowId: showId })) {
      if (season.seasonNumber === 0 || listed.has(season.seasonNumber)) continue;
      if (await episodeRepo.existsBy({ seasonId: season.id })) continue;
      await seasonRepo.delete(season.id);
    }
  }

  /** Moves stored episode keys of the show from their old numbers to their new ones. */
  private async moveKeys(
    manager: EntityManager,
    tv: number,
    moves: Map<string, Numbers>
  ): Promise<void> {
    if (!moves.size) return;
    for (const entity of [Progress, AvailabilityRequest, PlaybackGrant] as const) {
      // Equality lookups go through the repository: availability keys are encrypted.
      const repository = manager.getRepository<{ id: number; userId: string; playableKey: string }>(
        entity
      );
      const moving: Array<{ id: number; userId: string; to: string }> = [];
      for (const [oldKey, to] of moves)
        for (const row of await repository.find({
          select: { id: true, userId: true },
          where: { playableKey: oldKey },
        }))
          moving.push({ id: row.id, userId: row.userId, to: key(tv, to) });
      if (!moving.length) continue;
      // Park first: keys are unique per user and moves can form chains.
      for (const row of moving)
        await repository.update(row.id, { playableKey: `${PARKED}${row.id}` });
      const taken = new Set<string>();
      for (const to of new Set(moving.map(row => row.to)))
        for (const row of await repository.find({
          select: { userId: true },
          where: { playableKey: to },
        }))
          taken.add(`${row.userId}\n${to}`);
      for (const row of moving) {
        const target = `${row.userId}\n${row.to}`;
        // A user who already has the target key keeps that record.
        if (taken.has(target)) await repository.delete(row.id);
        else {
          taken.add(target);
          await repository.update(row.id, { playableKey: row.to });
        }
      }
    }

    const notificationRepo = manager.getRepository(Notification);
    const notifications = await notificationRepo.find({
      select: { id: true, seasonNumber: true, episodeNumber: true },
      where: { mediaType: 'tv', mediaId: tv },
    });
    for (const notification of notifications) {
      if (notification.seasonNumber === null || notification.episodeNumber === null) continue;
      const to = moves.get(
        key(tv, { season: notification.seasonNumber, episode: notification.episodeNumber })
      );
      if (to)
        await notificationRepo.update(notification.id, {
          seasonNumber: to.season,
          episodeNumber: to.episode,
        });
    }
  }
}
