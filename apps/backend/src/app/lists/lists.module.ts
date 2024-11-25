import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JackettService } from '../jackett/jackett.service';
import {
  parseTorrentProvider,
  webTorrentProvider,
} from '../app.async.provider';
import { MovieProcessor } from '../movies/movies.processor';
import { MoviesService } from '../movies/movies.service';
import { ListsController } from './lists.controller';
import { ShowsService } from '../shows/shows.service';

@Module({
  imports: [HttpModule],
  controllers: [ListsController],
  providers: [
    MovieProcessor,
    MoviesService,
    ShowsService,
    JackettService,
    parseTorrentProvider,
    webTorrentProvider,
  ],
  exports: [parseTorrentProvider, webTorrentProvider],
})
export class ListsModule {}
