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
}
