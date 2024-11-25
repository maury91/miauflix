import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SequelizeModule } from '@nestjs/sequelize';
import { Torrent } from '../database/entities/torrent.entity';
import { Movie } from '../database/entities/movie.entity';
import {
  parseTorrentProvider,
  webTorrentProvider,
} from '../app.async.provider';
import { TorrentProcessor } from './torrent.processor';
import { TorrentService } from './torrent.service';
import { TorrentController } from './torrent.controller';
import { TraktApi } from '../trakt/trakt.api';
import { Source } from '../database/entities/source.entity';
import { TorrentOrchestratorProcessor } from './torrent.orchestrator.processor';
import { TorrentGateway } from './torrent.gateway';

@Module({
  imports: [HttpModule, SequelizeModule.forFeature([Torrent, Movie, Source])],
  controllers: [TorrentController],
  providers: [
    parseTorrentProvider,
    webTorrentProvider,
    TraktApi,
    TorrentService,
    TorrentOrchestratorProcessor,
    TorrentProcessor,
    TorrentGateway,
  ],
  exports: [SequelizeModule, parseTorrentProvider, webTorrentProvider],
})
export class TorrentModule {}
