import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { TraktService } from './trakt.service';
import { Request } from 'express';
import { ProgressDto, TrackMoviePlaybackRequest } from '@miauflix/types';
import { MovieService } from '../movies/movies.service';
import { UserData } from '../user/user.data';

@Controller('progress')
export class TraktController {
  constructor(
    private readonly userData: UserData,
    private readonly movieService: MovieService,
    private readonly traktService: TraktService
  ) {}

  @Get('')
  async getProgress(@Req() req: Request): Promise<ProgressDto> {
    const userId = req.headers['x-user-id'];
    if (typeof userId !== 'string' || !userId) {
      throw new BadRequestException('User id missing');
    }
    const accessToken = await this.userData.getUserAccessToken(
      parseInt(userId, 10)
    );
    console.log('Getting progress for user ', userId);
    const rawProgress = await this.traktService.getProgress(accessToken);
    const extendedMovies = await this.movieService.addExtendedDataToMovies(
      rawProgress
        .filter((progress) => progress.type === 'movie')
        .map((progress) => progress.movie)
    );
    return rawProgress
      .filter((progress) => progress.type === 'movie')
      .map((progress) => ({
        progress: progress.progress,
        pausedAt: progress.paused_at,
        type: progress.type,
        movie: extendedMovies.find(
          (movie) => movie.ids.trakt === progress.movie.ids.trakt
        ),
      }));
  }

  @Post(':slug')
  async watchMovie(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Body() { action, progress }: TrackMoviePlaybackRequest
  ) {
    const userId = req.headers['x-user-id'];
    if (typeof userId !== 'string' || !userId) {
      throw new BadRequestException('User id missing');
    }
    const accessToken = await this.userData.getUserAccessToken(
      parseInt(userId, 10)
    );
    console.log('Got access token for user', userId);
    await this.traktService.trackPlayback(slug, accessToken, action, progress);
    return { success: true };
  }
}
