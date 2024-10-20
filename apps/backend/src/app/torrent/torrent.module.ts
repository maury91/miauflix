import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { queues } from '../../queues';
import { HttpModule } from '@nestjs/axios';
import { SequelizeModule } from '@nestjs/sequelize';
import { Torrent } from '../database/entities/torrent.entity';
import { Movie } from '../database/entities/movie.entity';
import {
  parseTorrentProvider,
  webTorrentProvider,
} from '../app.async.provider';
import { JackettData } from '../jackett/jackett.data';
import { MoviesData } from '../movies/movies.data';
import { TorrentProcessor } from './torrent.processor';
import { TorrentService } from './torrent.service';
import { TorrentController } from './torrent.controller';
import { TorrentData } from './torrent.data';
import { MovieProcessorService } from '../movies/movies.processor.service';
import { TraktService } from '../trakt/trakt.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: queues.torrent,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 10,
      },
    }),
    HttpModule,
    SequelizeModule.forFeature([Torrent, Movie]),
  ],
  controllers: [TorrentController],
  providers: [
    parseTorrentProvider,
    webTorrentProvider,
    JackettData,
    MovieProcessorService,
    TraktService,
    MoviesData,
    TorrentData,
    TorrentService,
    TorrentProcessor,
  ],
  exports: [SequelizeModule, parseTorrentProvider, webTorrentProvider],
})
export class TorrentModule {}
