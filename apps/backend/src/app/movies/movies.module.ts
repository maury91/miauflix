import { Module } from '@nestjs/common';
import { TraktService } from '../trakt/trakt.service';
import { MoviesController } from './movies.controller';
import { HttpModule } from '@nestjs/axios';
import { TMDBService } from '../tmdb/tmdb.service';
import { JackettService } from '../jackett/jackett.service';
import { BullModule } from '@nestjs/bullmq';
import { queues } from '../../queues';
import { SequelizeModule } from '@nestjs/sequelize';
import { Movie } from '../database/entities/movie.entity';
import { MovieProcessor } from './movies.processor';
import { Torrent } from '../database/entities/torrent.entity';
import { MoviesData } from './movies.data';
import {
  parseTorrentProvider,
  webTorrentProvider,
} from '../app.async.provider';
import { MovieService } from './movies.service';

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
  controllers: [MoviesController],
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
export class MoviesModule {}
