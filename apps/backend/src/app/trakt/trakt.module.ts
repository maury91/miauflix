import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TraktService } from '../trakt/trakt.service';
import { UserService } from '../user/user.service';
import { TraktController } from './trakt.controller';
import { MovieService } from '../movies/movies.service';
import { TMDBService } from '../tmdb/tmdb.service';

@Module({
  imports: [HttpModule],
  controllers: [TraktController],
  providers: [TraktService, UserService, MovieService, TMDBService],
  exports: [],
})
export class TraktModule {}
