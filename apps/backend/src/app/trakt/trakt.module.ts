import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { UserService } from '../user/user.service';
import { TraktController } from './trakt.controller';
import { MoviesService } from '../movies/movies.service';

@Module({
  imports: [HttpModule],
  controllers: [TraktController],
  providers: [UserService, MoviesService],
  exports: [],
})
export class TraktModule {}
