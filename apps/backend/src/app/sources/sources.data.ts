import { Global, Injectable, Module } from '@nestjs/common';
import {
  MovieSource,
  MovieSourceCreationAttributes,
} from '../../database/entities/movie.source.entity';
import { Movie } from '../../database/entities/movie.entity';
import {
  EpisodeSource,
  EpisodeSourceCreationAttributes,
} from '../../database/entities/episode.source.entity';
import { Episode } from '../../database/entities/episode.entity';
import { Show } from '../../database/entities/show.entity';
import { Season } from '../../database/entities/season.entity';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

interface UpdateSourceArgs {
  type: 'movie' | 'episode';
  id: number;
  status?: MovieSource['status'] | EpisodeSource['status'];
  downloadedPath?: string;
  downloaded?: Buffer;
  downloadPercentage?: number;
}

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

  async updateSource({ type, id, ...changes }: UpdateSourceArgs) {
    if (type === 'movie') {
      return this.movieSourceModel.update(id, {
        ...changes,
        lastUsedAt: new Date(),
      });
    }

    return this.episodeSourceModel.update(id, {
      ...changes,
      lastUsedAt: new Date(),
    });
  }

  async clearSource(type: 'movie' | 'episode', id: number) {
    return this.updateSource({
      id,
      type,
      status: 'created',
      downloadedPath: null,
      downloaded: null,
      downloadPercentage: 0,
    });
  }

  async getUsedStorage() {
    const movieSources = await this.movieSourceModel.find({
      where: {
        status: Not('created'),
      },
    });

    const episodeSources = await this.episodeSourceModel.find({
      where: {
        status: Not('created'),
      },
    });

    return [
      ...movieSources.map((source) => ({
        source,
        type: 'movie' as const,
      })),
      ...episodeSources.map((source) => ({
        source,
        type: 'episode' as const,
      })),
    ];
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
