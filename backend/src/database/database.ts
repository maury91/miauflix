import path from "path";
import { DataSource } from "typeorm";

import { Movie, MovieTranslation } from "@entities/movie.entity";
import { TVShow } from "@entities/tvshow.entity";
import { TVShowTranslation } from "@entities/tvshow.entity";
import { Season } from "@entities/season.entity";
import { Episode } from "@entities/episode.entity";
import { MediaList } from "@entities/list.entity";

import { MediaListRepository } from "@repositories/mediaList.repository";
import { MovieRepository } from "@repositories/movie.repository";
import { TVShowRepository } from "@repositories/tvshow.repository";
import { Genre, GenreTranslation } from "@entities/genre.entity";
import { GenreRepository } from "@repositories/genre.repository";

export class Database {
  private readonly dataSource: DataSource;
  private mediaListRepository: MediaListRepository;
  private movieRepository: MovieRepository;
  private tvShowRepository: TVShowRepository;
  private genreRepository: GenreRepository;

  constructor() {
    this.dataSource = new DataSource({
      type: "sqlite",
      database: path.resolve(process.cwd(), "database.sqlite"),
      entities: [
        Movie,
        MovieTranslation,
        TVShow,
        TVShowTranslation,
        Season,
        Episode,
        MediaList,
        Genre,
        GenreTranslation,
      ],
      synchronize: true,
    });
  }

  public async initialize() {
    await this.dataSource.initialize();
    this.mediaListRepository = new MediaListRepository(this.dataSource);
    this.movieRepository = new MovieRepository(this.dataSource);
    this.tvShowRepository = new TVShowRepository(this.dataSource);
    this.genreRepository = new GenreRepository(this.dataSource);
  }

  public getMovieRepository() {
    return this.movieRepository;
  }

  public getTVShowRepository() {
    return this.tvShowRepository;
  }

  public getSeasonRepository() {
    return this.dataSource.getRepository(Season);
  }

  public getEpisodeRepository() {
    return this.dataSource.getRepository(Episode);
  }

  public getMediaListRepository() {
    return this.mediaListRepository;
  }

  public getGenreRepository() {
    return this.genreRepository;
  }
}
