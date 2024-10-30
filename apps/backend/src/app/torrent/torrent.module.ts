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
import { MoviesData } from '../movies/movies.data';
import { TorrentProcessor } from './torrent.processor';
import { TorrentService } from './torrent.service';
import { TorrentController } from './torrent.controller';
import { TorrentData } from './torrent.data';
import { TraktService } from '../trakt/trakt.service';
import { Source } from '../database/entities/source.entity';
import { SourceData } from '../sources/sources.data';
import { TorrentOrchestratorProcessor } from './torrent.orchestrator.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: queues.torrent,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: 10,
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
    SequelizeModule.forFeature([Torrent, Movie, Source]),
  ],
  controllers: [TorrentController],
  providers: [
    parseTorrentProvider,
    webTorrentProvider,
    TraktService,
    MoviesData,
    SourceData,
    TorrentData,
    TorrentService,
    TorrentOrchestratorProcessor,
    TorrentProcessor,
  ],
  exports: [SequelizeModule, parseTorrentProvider, webTorrentProvider],
})
export class TorrentModule {}
