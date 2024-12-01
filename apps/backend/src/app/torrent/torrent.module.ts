import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import {
  parseTorrentProvider,
  webTorrentProvider,
} from '../app.async.provider';
import { TorrentProcessor } from './torrent.processor';
import { TorrentService } from './torrent.service';
import { TorrentController } from './torrent.controller';
import { TraktApi } from '../trakt/trakt.api';
import { TorrentOrchestratorProcessor } from './torrent.orchestrator.processor';
import { TorrentGateway } from './torrent.gateway';

@Module({
  imports: [HttpModule],
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
  exports: [parseTorrentProvider, webTorrentProvider],
})
export class TorrentModule {}
