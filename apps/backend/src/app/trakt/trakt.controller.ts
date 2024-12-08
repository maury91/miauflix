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
import {
  MovieProgressDto,
  ShowProgressDto,
  TrackPlaybackRequest,
} from '@miauflix/types';
import { MoviesService } from '../movies/movies.service';
import { UserData } from '../user/user.data';
import { ShowsService } from '../shows/shows.service';

@Controller('progress')
export class TraktController {
  constructor(
    private readonly userData: UserData,
    private readonly moviesService: MoviesService,
    private readonly showsService: ShowsService,
    private readonly traktService: TraktApi
  ) {}

  @Get('movies')
  async getMoviesProgress(@Req() req: Request): Promise<MovieProgressDto[]> {
    const userId = req.headers['x-user-id'];
    if (typeof userId !== 'string' || !userId) {
      throw new BadRequestException('User id missing');
    }
    const accessToken = await this.userData.getUserAccessToken(
      parseInt(userId, 10)
    );
    const rawProgress = await this.traktService.getProgress(
      accessToken,
      'movies'
    );
    const extendedMovies = await this.moviesService.addExtendedDataToMovies(
      rawProgress.map((progress) => progress.movie)
    );
    return rawProgress.map((progress) => ({
      progress: progress.progress,
      pausedAt: progress.paused_at,
      type: progress.type,
      movie: extendedMovies.find(
        (movie) => movie.id === progress.movie.ids.slug
      ),
    }));
  }

  @Get('episodes')
  async getEpisodesProgress(@Req() req: Request): Promise<ShowProgressDto[]> {
    const userId = req.headers['x-user-id'];
    if (typeof userId !== 'string' || !userId) {
      throw new BadRequestException('User id missing');
    }
    const accessToken = await this.userData.getUserAccessToken(
      parseInt(userId, 10)
    );
    const rawProgress = await this.traktService.getProgress(
      accessToken,
      'episodes'
    );
    const showsSimple = rawProgress
      .map((progress) => progress.show)
      .filter(
        (show, index, arr) =>
          arr.findIndex((s) => s.ids.slug === show.ids.slug) === index
      );
    const shows = await this.showsService.addExtendedDataToShows(showsSimple);

    return rawProgress.map((progress) => ({
      progress: progress.progress,
      pausedAt: progress.paused_at,
      type: progress.type,
      show: shows.find((show) => show.id === progress.show.ids.slug),
      episode: progress.episode.number,
      season: progress.episode.season,
    }));
  }

  @Post(':slug')
  async watchMovie(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Body() { action, progress, type }: TrackPlaybackRequest
  ) {
    const userId = req.headers['x-user-id'];
    if (typeof userId !== 'string' || !userId) {
      throw new BadRequestException('User id missing');
    }
    const accessToken = await this.userData.getUserAccessToken(
      parseInt(userId, 10)
    );
    try {
      await this.traktService.trackPlayback(
        slug,
        accessToken,
        type,
        action,
        progress
      );
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false };
    }
  }
}
