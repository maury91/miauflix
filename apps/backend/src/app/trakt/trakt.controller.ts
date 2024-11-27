import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { TraktApi } from './trakt.api';
import { Request } from 'express';
import { ProgressDto, TrackMoviePlaybackRequest } from '@miauflix/types';
import { MoviesService } from '../movies/movies.service';
import { UserData } from '../user/user.data';

@Controller('progress')
export class TraktController {
  constructor(
    private readonly userData: UserData,
    private readonly moviesService: MoviesService,
    private readonly traktService: TraktApi
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
    const rawProgress = await this.traktService.getProgress(accessToken);
    const extendedMovies = await this.moviesService.addExtendedDataToMovies(
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
          (movie) => movie.id === progress.movie.ids.slug
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
    await this.traktService.trackPlayback(slug, accessToken, action, progress);
    return { success: true };
  }
}
