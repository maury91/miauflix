import { Global, Injectable, Module } from '@nestjs/common';
import { InjectModel, SequelizeModule } from '@nestjs/sequelize';
import {
  MovieSource,
  MovieSourceCreationAttributes,
} from '../database/entities/movie.source.entity';
import { Movie } from '../database/entities/movie.entity';
import {
  EpisodeSource,
  EpisodeSourceCreationAttributes,
} from '../database/entities/episode.source.entity';
import { Episode } from '../database/entities/episode.entity';
import { Show } from '../database/entities/show.entity';
import { Season } from '../database/entities/season.entity';

@Injectable()
export class SourceData {
  constructor(
    @InjectModel(MovieSource)
    private readonly movieSourceModel: typeof MovieSource,
    @InjectModel(EpisodeSource)
    private readonly episodeSourceModel: typeof EpisodeSource
  ) {}

  async createMovieSource(
    source: MovieSourceCreationAttributes
  ): Promise<MovieSource> {
    return this.movieSourceModel.create(source);
  }

  async createEpisodeSource(
    source: EpisodeSourceCreationAttributes
  ): Promise<EpisodeSource> {
    return this.episodeSourceModel.create(source);
  }
}

@Global()
@Module({
  imports: [
    SequelizeModule.forFeature([
      Movie,
      MovieSource,
      Show,
      Season,
      Episode,
      EpisodeSource,
    ]),
  ],
  providers: [SourceData],
  exports: [SourceData, SequelizeModule],
})
export class SourceDataModule {}
