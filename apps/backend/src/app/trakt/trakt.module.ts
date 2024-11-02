import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TraktService } from '../trakt/trakt.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { AccessToken } from '../database/entities/accessToken.entity';
import { UserService } from '../user/user.service';
import { User } from '../database/entities/user.entity';
import { TraktController } from './trakt.controller';
import { MovieService } from '../movies/movies.service';
import { TMDBService } from '../tmdb/tmdb.service';
import { MoviesData } from '../movies/movies.data';
import { Movie } from '../database/entities/movie.entity';
import { Torrent } from '../database/entities/torrent.entity';
import { BullModule } from '@nestjs/bullmq';
import { queues } from '@miauflix/types';

@Module({
  imports: [
    BullModule.registerQueue({
      name: queues.torrentOrchestrator,
      defaultJobOptions: {
        removeOnComplete: true,
      },
    }),
    HttpModule,
    SequelizeModule.forFeature([Movie, Torrent, User, AccessToken]),
  ],
  controllers: [TraktController],
  providers: [TraktService, UserService, MovieService, TMDBService, MoviesData],
  exports: [SequelizeModule],
})
export class TraktModule {}
