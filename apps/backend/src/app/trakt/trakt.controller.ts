import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { TrackPlaybackRequest } from '@miauflix/types';
import { UserData } from '../user/user.data';
import { ShowsData } from '../shows/shows.data';
import { MoviesData } from '../movies/movies.data';

@Controller('progress')
export class TraktController {
  constructor(
    private readonly userData: UserData,
    private readonly showsData: ShowsData,
    private readonly moviesData: MoviesData
  ) {}

  @Get('')
  async getProgress(@Req() req: Request) {
    const userId = req.headers['x-user-id'];
    if (typeof userId !== 'string' || !userId) {
      throw new BadRequestException('User id missing');
    }

    return await this.userData.getProgressWithMedias(parseInt(userId, 10));
  }

  @Post(':id')
  async updateProgress(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @Body() { status, progress, type }: TrackPlaybackRequest
  ) {
    const userId = req.headers['x-user-id'];
    if (typeof userId !== 'string' || !userId) {
      throw new BadRequestException('User id missing');
    }
    try {
      if (type === 'episode') {
        const episode = await this.showsData.findEpisode(id);
        await this.userData.updateEpisodeProgress(
          parseInt(userId, 10),
          id,
          Math.floor(episode.runtime * 0.6 * progress),
          status,
          episode.traktId
        );
      } else {
        const movie = await this.moviesData.findMovieById(id);
        await this.userData.updateMovieProgress(
          parseInt(userId, 10),
          id,
          Math.floor(movie.runtime * 0.6 * progress),
          status,
          movie.slug
        );
      }
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false };
    }
  }
}
