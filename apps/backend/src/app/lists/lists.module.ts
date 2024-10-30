import { Module } from '@nestjs/common';
import { TraktService } from '../trakt/trakt.service';
import { HttpModule } from '@nestjs/axios';
import { TMDBService } from '../tmdb/tmdb.service';
import { JackettService } from '../jackett/jackett.service';
import { BullModule } from '@nestjs/bullmq';
import { queues } from '../../queues';
import { SequelizeModule } from '@nestjs/sequelize';
import { Movie } from '../database/entities/movie.entity';
import { Torrent } from '../database/entities/torrent.entity';
import {
  parseTorrentProvider,
  webTorrentProvider,
} from '../app.async.provider';
import { MovieProcessor } from '../movies/movies.processor';
import { MovieService } from '../movies/movies.service';
import { MoviesData } from '../movies/movies.data';
import { ListsController } from './lists.controller';

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: queues.movie,
        defaultJobOptions: {
          removeOnComplete: true,
        },
      },
      {
        name: queues.jackett,
        defaultJobOptions: {
          removeOnComplete: true,
        },
      },
      {
        name: queues.torrentOrchestrator,
        defaultJobOptions: {
          removeOnComplete: true,
        },
      }
    ),
    HttpModule,
    SequelizeModule.forFeature([Movie, Torrent]),
  ],
  controllers: [ListsController],
  providers: [
    MovieProcessor,
    MovieService,
    TraktService,
    TMDBService,
    JackettService,
    MoviesData,
    parseTorrentProvider,
    webTorrentProvider,
  ],
  exports: [SequelizeModule, parseTorrentProvider, webTorrentProvider],
})
export class ListsModule {}
