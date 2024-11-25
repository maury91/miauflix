import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { StaticCategories } from '../categories/categories.const';
import { MoviesService } from '../movies/movies.service';
import { ShowsService } from '../shows/shows.service';

@Controller('lists')
export class ListsController {
  constructor(
    private readonly moviesService: MoviesService,
    private readonly showsService: ShowsService
  ) {}

  @Get(':listId')
  async getList(
    @Param('listId') listId: StaticCategories | string,
    @Query('page', ParseIntPipe) page: number
  ) {
    switch (listId) {
      case StaticCategories.TrendingMovies:
        return this.moviesService.getTrendingMovies(page);
      case StaticCategories.PopularMovies:
        return this.moviesService.getPopularMovies(page);
      case StaticCategories.TrendingShows:
        return this.showsService.getTrendingShows(page);
    }
    return [];
  }
}
