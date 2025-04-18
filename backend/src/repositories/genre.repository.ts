import type { DataSource, Repository } from "typeorm";

import { Genre, GenreTranslation } from "@entities/genre.entity";

export class GenreRepository {
  private readonly genreRepository: Repository<Genre>;
  private readonly genreTranslationRepository: Repository<GenreTranslation>;

  constructor(datasource: DataSource) {
    this.genreRepository = datasource.getRepository(Genre);
    this.genreTranslationRepository =
      datasource.getRepository(GenreTranslation);
  }

  async createOrGetGenre(id: number): Promise<Genre> {
    const genre = await this.genreRepository.findOne({ where: { id } });
    if (genre) {
      return genre;
    }
    const newGenre = this.genreRepository.create({ id });
    return this.genreRepository.save(newGenre);
  }

  async createTranslation(
    genre: Genre,
    name: string,
    language: string,
  ): Promise<void> {
    const existingTranslation = await this.genreTranslationRepository.findOne({
      where: { genreId: genre.id, language },
    });
    if (!existingTranslation) {
      const newTranslation = this.genreTranslationRepository.create({
        genre,
        name,
        language,
      });
      await this.genreTranslationRepository.save(newTranslation);
    }
  }

  async findAll(): Promise<Genre[]> {
    return this.genreRepository.find({
      relations: {
        translations: true,
      },
    });
  }
}
