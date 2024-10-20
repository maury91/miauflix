import { Controller, Get, Param } from '@nestjs/common';
import { MovieService } from './movies.service';

@Controller('movies')
export class MoviesController {
  constructor(private readonly movieService: MovieService) {}

  @Get('trending')
  async getTrendingMovies() {
    return this.movieService.getTrendingMovies();
  }

  @Get(':slug')
  async getMovie(@Param('slug') slug: string) {
    return this.movieService.getMovie(slug);
  }
}
