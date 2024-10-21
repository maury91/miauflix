import { Controller, Get, Param } from '@nestjs/common';
import { StaticCategories } from '../categories/categories.const';
import { MovieService } from '../movies/movies.service';

@Controller('lists')
export class ListsController {
  constructor(private readonly movieService: MovieService) {}

  @Get(':listId')
  async getList(@Param('listId') listId: StaticCategories | string) {
    switch (listId) {
      case StaticCategories.TrendingMovies:
        return this.movieService.getTrendingMovies();
    }
  }
}
