import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { MovieService } from './movies.service';
import { Request } from 'express';
import { TrackMoviePlaybackRequest } from '@miauflix/types';
import { UserService } from '../user/user.service';

@Controller('movies')
export class MoviesController {
  constructor(
    private readonly movieService: MovieService,
    private readonly userService: UserService
  ) {}

  @Get(':slug')
  async getMovie(@Param('slug') slug: string) {
    return this.movieService.getMovie(slug);
  }
}
