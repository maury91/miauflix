import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TraktService } from '../trakt/trakt.service';
import { MoviesController } from './movies.controller';
import { TMDBService } from '../tmdb/tmdb.service';
import { JackettService } from '../jackett/jackett.service';
import { MovieProcessor } from './movies.processor';
import {
  parseTorrentProvider,
  webTorrentProvider,
} from '../app.async.provider';
import { MovieService } from './movies.service';
import { UserService } from '../user/user.service';

@Module({
  imports: [HttpModule],
  controllers: [MoviesController],
  providers: [
    MovieProcessor,
    MovieService,
    TraktService,
    TMDBService,
    UserService,
    JackettService,
    parseTorrentProvider,
    webTorrentProvider,
  ],
  exports: [parseTorrentProvider, webTorrentProvider],
})
export class MoviesModule {}
