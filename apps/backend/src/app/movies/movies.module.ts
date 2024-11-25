import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MoviesController } from './movies.controller';
import { JackettService } from '../jackett/jackett.service';
import { MovieProcessor } from './movies.processor';
import {
  parseTorrentProvider,
  webTorrentProvider,
} from '../app.async.provider';
import { MoviesService } from './movies.service';

@Module({
  imports: [HttpModule],
  controllers: [MoviesController],
  providers: [
    MovieProcessor,
    MoviesService,
    JackettService,
    parseTorrentProvider,
    webTorrentProvider,
  ],
  exports: [parseTorrentProvider, webTorrentProvider],
})
export class MoviesModule {}
