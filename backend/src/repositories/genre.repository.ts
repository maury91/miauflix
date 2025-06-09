import type { DataSource, Repository } from 'typeorm';

import { Genre, GenreTranslation } from '@entities/genre.entity';

export class GenreRepository {
  private readonly genreRepository: Repository<Genre>;
  private readonly genreTranslationRepository: Repository<GenreTranslation>;

  constructor(datasource: DataSource) {
    this.genreRepository = datasource.getRepository(Genre);
    this.genreTranslationRepository = datasource.getRepository(GenreTranslation);
  }

  async createOrGetGenre(id: number): Promise<Genre> {
    await this.genreRepository.upsert({ id }, ['id']);
    const genre = await this.genreRepository.findOne({ where: { id } });
    if (genre) {
      return genre;
    }
    throw new Error(`Genre with ID ${id} does not exist and could not be created`);
  }

  async createTranslation(genre: Genre, name: string, language: string): Promise<void> {
    await this.genreTranslationRepository.upsert(
      {
        genreId: genre.id,
        name,
        language,
      },
      ['genreId', 'language']
    );
  }

  async findAll(): Promise<Genre[]> {
    return this.genreRepository.find({
      relations: {
        translations: true,
      },
    });
  }
}
