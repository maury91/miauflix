import { Module } from '@nestjs/common';
import { TraktService } from '../trakt/trakt.service';
import { HttpModule } from '@nestjs/axios';
import { TMDBService } from '../tmdb/tmdb.service';
import { JackettService } from '../jackett/jackett.service';
import {
  parseTorrentProvider,
  webTorrentProvider,
} from '../app.async.provider';
import { MovieProcessor } from '../movies/movies.processor';
import { MovieService } from '../movies/movies.service';
import { ListsController } from './lists.controller';

@Module({
  imports: [HttpModule],
  controllers: [ListsController],
  providers: [
    MovieProcessor,
    MovieService,
    TraktService,
    TMDBService,
    JackettService,
    parseTorrentProvider,
    webTorrentProvider,
  ],
  exports: [parseTorrentProvider, webTorrentProvider],
})
export class ListsModule {}
