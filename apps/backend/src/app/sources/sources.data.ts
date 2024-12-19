import { Global, Injectable, Module } from '@nestjs/common';
import {
  MovieSource, MovieSourceCreationAttributes
} from '../database/entities/movie.source.entity';
import { Movie } from '../database/entities/movie.entity';
import {
  EpisodeSource, EpisodeSourceCreationAttributes
} from '../database/entities/episode.source.entity';
import { Episode } from '../database/entities/episode.entity';
import { Show } from '../database/entities/show.entity';
import { Season } from '../database/entities/season.entity';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class SourceData {
  constructor(
    @InjectRepository(MovieSource)
    private readonly movieSourceModel: Repository<MovieSource>,
    @InjectRepository(EpisodeSource)
    private readonly episodeSourceModel: Repository<EpisodeSource>
  ) {}

  async createMovieSource(
    source: MovieSourceCreationAttributes
  ): Promise<MovieSource> {
    return this.movieSourceModel.save(source);
  }

  async createEpisodeSource(
    source: EpisodeSourceCreationAttributes
  ): Promise<EpisodeSource> {
    return this.episodeSourceModel.save(source);
  }
}

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Movie,
      MovieSource,
      Show,
      Season,
      Episode,
      EpisodeSource,
    ]),
  ],
  providers: [SourceData],
  exports: [SourceData, TypeOrmModule],
})
export class SourceDataModule {}
