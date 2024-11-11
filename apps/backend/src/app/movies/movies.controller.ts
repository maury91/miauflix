import { Controller, Get, Param, Query } from '@nestjs/common';
import { MovieService } from './movies.service';
import { TraktService } from '../trakt/trakt.service';

@Controller('movies')
export class MoviesController {
  constructor(
    private readonly movieService: MovieService,
    private readonly traktService: TraktService
  ) {}

  @Get('search/')
  async searchMovies(@Query('query') query: string) {
    if (!query) {
      return [];
    }
    const { data } = await this.traktService.searchMovies(query);
    const lastTerm = query.split(/\b/).pop().toLowerCase();
    const movies = data.map(({ movie }) => movie);
    const autocomplete = movies
      .map(({ title }) =>
        title.split(/\b/).find((word) => word.toLowerCase().includes(lastTerm))
      )
      .filter((word, index, arr) => word && arr.indexOf(word) === index);
    return {
      movies,
      autocomplete,
    };
  }

  @Get(':slug')
  async getMovie(@Param('slug') slug: string) {
    return this.movieService.getMovie(slug);
  }
}
