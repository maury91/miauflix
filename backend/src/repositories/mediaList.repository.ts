import { DataSource, Repository } from "typeorm";
import { MediaList } from "../entities/list.entity";
import { Database } from "@database/database";

export class MediaListRepository {
  private readonly repository: Repository<MediaList>;

  constructor(datasource: DataSource) {
    this.repository = datasource.getRepository(MediaList);
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

  createMediaList(
    name: string,
    description: string,
    slug: string,
  ): Promise<MediaList> {
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
}
