import { Not, type Repository } from 'typeorm';

import type { Database } from '@database/database';
import { MediaList, MediaListItem, type MediaListItemType } from '@entities/list.entity';

export class MediaListRepository {
  private readonly repository: Repository<MediaList>;
  private readonly itemRepository: Repository<MediaListItem>;

  constructor(private readonly database: Database) {
    const db = database;
    this.repository = db.getRepository(MediaList);
    this.itemRepository = db.getRepository(MediaListItem);
  }

  findBySlug(slug: string, _preload = false, ownerKey = 'public'): Promise<MediaList | null> {
    return this.repository.findOne({ where: { slug, ownerKey } });
  }

  createMediaList(
    name: string,
    description: string,
    slug: string,
    ownerKey = 'public',
    remoteListId: string | null = slug
  ): Promise<MediaList> {
    return this.repository.save(
      this.repository.create({
        name,
        description,
        slug,
        ownerKey,
        remoteListId,
        provider: 'trakt',
        activeGeneration: null,
        lastSyncedAt: null,
      })
    );
  }

  async findOrCreateMediaList(
    name: string,
    description: string,
    slug: string,
    ownerKey = 'public',
    remoteListId: string | null = slug
  ): Promise<MediaList> {
    return this.database.write(async () => {
      const existing = await this.repository.findOne({ where: { slug, ownerKey } });
      if (existing) return existing;

      await this.repository
        .createQueryBuilder()
        .insert()
        .into(MediaList)
        .values({ name, description, slug, ownerKey, remoteListId, provider: 'trakt' })
        .orIgnore()
        .execute();

      const created = await this.repository.findOne({ where: { slug, ownerKey } });
      if (!created) throw new Error(`Unable to create media list ${ownerKey}/${slug}`);
      return created;
    });
  }

  async stagePage(
    listId: number,
    generation: string,
    offset: number,
    items: Array<{ mediaType: MediaListItemType; mediaId: number }>
  ): Promise<void> {
    if (!items.length) return;
    await this.database.write(() =>
      this.itemRepository
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
        .orIgnore()
        .execute()
    );
  }

  async activateGeneration(listId: number, generation: string): Promise<void> {
    await this.database.transaction(async manager => {
      await manager
        .getRepository(MediaList)
        .update(listId, { activeGeneration: generation, lastSyncedAt: new Date() });
      await manager.getRepository(MediaListItem).delete({ listId, generation: Not(generation) });
    });
  }

  discardGeneration(listId: number, generation: string): Promise<void> {
    return this.itemRepository.delete({ listId, generation }).then(() => undefined);
  }

  getPage(
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

  async addItem(
    listId: number,
    generation: string,
    item: { mediaType: MediaListItemType; mediaId: number }
  ): Promise<void> {
    await this.database.write(async () => {
      const result = await this.itemRepository
        .createQueryBuilder('item')
        .select('MAX(item.position)', 'maxPosition')
        .where('item.listId = :listId AND item.generation = :generation', { listId, generation })
        .getRawOne<{ maxPosition: number | null }>();
      await this.itemRepository
        .createQueryBuilder()
        .insert()
        .into(MediaListItem)
        .values({
          listId,
          generation,
          position: (result?.maxPosition ?? -1) + 1,
          ...item,
        })
        .orIgnore()
        .execute();
    });
  }

  async removeItem(
    listId: number,
    generation: string,
    item: { mediaType: MediaListItemType; mediaId: number }
  ): Promise<void> {
    await this.itemRepository.delete({ listId, generation, ...item });
  }

  getActiveItems(listId: number, generation: string): Promise<MediaListItem[]> {
    return this.itemRepository.find({
      where: { listId, generation },
      order: { position: 'ASC' },
    });
  }

  hasActiveItem(
    listId: number,
    generation: string,
    item: { mediaType: MediaListItemType; mediaId: number }
  ): Promise<boolean> {
    return this.itemRepository.exist({ where: { listId, generation, ...item } });
  }

  async hasAnyLocalMovie(mediaId: number): Promise<boolean> {
    return this.itemRepository
      .createQueryBuilder('item')
      .innerJoin(MediaList, 'list', 'list.id = item.listId')
      .where('item.generation = :generation', { generation: 'local' })
      .andWhere('item.mediaType = :mediaType', { mediaType: 'movie' })
      .andWhere('item.mediaId = :mediaId', { mediaId })
      .andWhere('list.slug = :slug', { slug: 'my-watchlist' })
      .getExists();
  }

  /** Count local watchlist owners for a movie so shared interest can influence planning priority. */
  async countLocalMovieInterests(mediaId: number): Promise<number> {
    return this.itemRepository
      .createQueryBuilder('item')
      .innerJoin(MediaList, 'list', 'list.id = item.listId')
      .where('item.generation = :generation', { generation: 'local' })
      .andWhere('item.mediaType = :mediaType', { mediaType: 'movie' })
      .andWhere('item.mediaId = :mediaId', { mediaId })
      .andWhere('list.slug = :slug', { slug: 'my-watchlist' })
      .getCount();
  }
}
