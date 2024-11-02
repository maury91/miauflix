import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { queues } from '@miauflix/types';
import { TraktService } from '../trakt/trakt.service';
import { MoviesController } from './movies.controller';
import { TMDBService } from '../tmdb/tmdb.service';
import { JackettService } from '../jackett/jackett.service';
import { BullModule } from '@nestjs/bullmq';
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
import { AccessToken } from '../database/entities/accessToken.entity';
import { UserService } from '../user/user.service';
import { User } from '../database/entities/user.entity';

@Module({
  imports: [
    HttpModule,
    SequelizeModule.forFeature([Movie, Torrent, User, AccessToken]),
  ],
  controllers: [MoviesController],
  providers: [
    MovieProcessor,
    MovieService,
    TraktService,
    TMDBService,
    UserService,
    JackettService,
    MoviesData,
    parseTorrentProvider,
    webTorrentProvider,
  ],
  exports: [SequelizeModule, parseTorrentProvider, webTorrentProvider],
})
export class MoviesModule {}
