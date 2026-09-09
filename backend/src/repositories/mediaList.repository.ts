import { IsNull, Not, type Repository } from 'typeorm';
import type { RelationMetadata } from 'typeorm/metadata/RelationMetadata';

import type { Database } from '@database/database';
import { MediaList, MediaListItem, type MediaListItemType } from '@entities/list.entity';

export class MediaListRepository {
  private readonly repository: Repository<MediaList>;
  private readonly itemRepository: Repository<MediaListItem>;

  constructor(db: Database) {
    this.repository = db.getRepository(MediaList);
    this.itemRepository = db.getRepository(MediaListItem);
  }

  async findByName(name: string): Promise<MediaList | null> {
    return this.repository.findOne({ where: { name } });
  }

  async findBySlug(slug: string, preload: boolean): Promise<MediaList | null> {
    return this.repository.findOne({
      relations: {
        movies: preload,
        tvShows: preload,
        seasons: preload,
      },
      where: { slug },
    });
  }

  async saveMediaList(mediaList: MediaList): Promise<MediaList> {
    return this.repository.save(mediaList);
  }

  /**
   * Replaces list membership without loading or saving a graph of media entities.
   * The relation tables are queried for scalar ids only, then changed atomically.
   */
  async replaceMembership(
    listId: number,
    movieIds: Iterable<number>,
    tvShowIds: Iterable<number>
  ): Promise<void> {
    await this.repository.manager.transaction(async manager => {
      await this.replaceRelationMembership(manager, listId, 'movies', movieIds);
      await this.replaceRelationMembership(manager, listId, 'tvShows', tvShowIds);
    });
  }

  private async replaceRelationMembership(
    manager: Repository<MediaList>['manager'],
    listId: number,
    property: 'movies' | 'tvShows',
    desiredIds: Iterable<number>
  ): Promise<void> {
    const relation = this.repository.metadata.relations.find(
      candidate => candidate.propertyName === property
    );
    if (!relation?.junctionEntityMetadata) {
      throw new Error(`Missing junction metadata for MediaList.${property}`);
    }

    const currentIds = await this.getRelationIds(manager, relation, listId);
    const desired = new Set(desiredIds);
    const toAdd = [...desired].filter(id => !currentIds.has(id));
    const toRemove = [...currentIds].filter(id => !desired.has(id));
    if (toAdd.length || toRemove.length) {
      await manager
        .createQueryBuilder()
        .relation(MediaList, property)
        .of(listId)
        .addAndRemove(toAdd, toRemove);
    }
  }

  private async getRelationIds(
    manager: Repository<MediaList>['manager'],
    relation: RelationMetadata,
    listId: number
  ): Promise<Set<number>> {
    const junction = relation.junctionEntityMetadata!;
    const [ownerColumn] = relation.joinColumns;
    const [inverseColumn] = relation.inverseJoinColumns;
    const rows = await manager
      .createQueryBuilder()
      .select(`junction.${inverseColumn.databaseName}`, 'id')
      .from(junction.tablePath, 'junction')
      .where(`junction.${ownerColumn.databaseName} = :listId`, { listId })
      .getRawMany<{ id: number | string }>();
    return new Set(rows.map(({ id }) => Number(id)));
  }

  createMediaList(name: string, description: string, slug: string): Promise<MediaList> {
    const mediaList = this.repository.create({
      name,
      description,
      slug,
      movies: [],
      tvShows: [],
      seasons: [],
    });
    return this.saveMediaList(mediaList);
  }

  async stagePage(
    listId: number,
    generation: string,
    offset: number,
    items: Array<{ mediaType: MediaListItemType; mediaId: number }>
  ): Promise<void> {
    if (items.length === 0) return;
    await this.itemRepository
      .createQueryBuilder()
      .insert()
      .into(MediaListItem)
      .values(
        items.map((item, index) => ({
          listId,
          generation,
          position: offset + index,
          mediaType: item.mediaType,
          mediaId: item.mediaId,
        }))
      )
      // The service compacts positions, while this makes a retried page or malformed
      // provider response harmless instead of aborting an entire generation.
      .orIgnore()
      .execute();
  }

  async activateGeneration(listId: number, generation: string): Promise<void> {
    await this.repository.manager.transaction(async manager => {
      await manager.getRepository(MediaList).update(listId, {
        activeGeneration: generation,
        lastSyncedAt: new Date(),
      });
      await manager.getRepository(MediaListItem).delete({ listId, generation: Not(generation) });
    });
  }

  async discardGeneration(listId: number, generation: string): Promise<void> {
    await this.itemRepository.delete({ listId, generation });
  }

  async getPage(
    listId: number,
    generation: string,
    offset: number,
    limit: number
  ): Promise<MediaListItem[]> {
    return this.itemRepository.find({
      where: { listId, generation },
      order: { position: 'ASC' },
      skip: offset,
      take: limit,
    });
  }

  countItems(listId: number, generation: string): Promise<number> {
    return this.itemRepository.countBy({ listId, generation });
  }

  async backfillLegacyLists(): Promise<void> {
    const lists = await this.repository.find({
      relations: { movies: true, tvShows: true },
      where: { activeGeneration: IsNull() },
    });
    for (const list of lists) {
      const medias = [
        ...(list.movies ?? []).map(media => ({
          mediaType: 'movie' as const,
          popularity: media.popularity,
          mediaId: media.mediaId,
        })),
        ...(list.tvShows ?? []).map(media => ({
          mediaType: 'tv' as const,
          popularity: media.popularity,
          mediaId: media.mediaId,
        })),
      ].sort((a, b) => b.popularity - a.popularity);
      if (medias.length === 0) continue;
      const generation = `legacy-${list.id}`;
      await this.stagePage(list.id, generation, 0, medias);
      await this.activateGeneration(list.id, generation);
    }
  }
}
