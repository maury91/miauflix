import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { TraktService } from './trakt.service';
import { Request } from 'express';
import { UserService } from '../user/user.service';
import { ProgressDto, TrackMoviePlaybackRequest } from '@miauflix/types';
import { MovieService } from '../movies/movies.service';

@Controller('progress')
export class TraktController {
  constructor(
    private readonly userService: UserService,
    private readonly movieService: MovieService,
    private readonly traktService: TraktService
  ) {}

  @Get(':slug')
  async getProgress(@Req() req: Request): Promise<ProgressDto> {
    const userId = req.headers['x-user-id'];
    if (typeof userId !== 'string' || !userId) {
      throw new Error('User id missing');
    }
    const accessToken = await this.userService.getUserAccessToken(
      parseInt(userId, 10)
    );
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
    @Body() { action }: TrackMoviePlaybackRequest
  ) {
    const userId = req.headers['x-user-id'];
    if (typeof userId !== 'string' || !userId) {
      throw new Error('User id missing');
    }
    const accessToken = await this.userService.getUserAccessToken(
      parseInt(userId, 10)
    );
    return this.traktService.trackPlayback(slug, accessToken, action);
  }
}
