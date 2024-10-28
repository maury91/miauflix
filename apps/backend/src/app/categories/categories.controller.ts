import { Controller, Get } from '@nestjs/common';
import { StaticCategories } from './categories.const';

@Controller('categories')
export class CategoriesController {
  @Get('')
  async getCategories() {
    return [
      {
        id: StaticCategories.TrendingMovies,
        name: 'Trending movies',
      },
      {
        id: StaticCategories.PopularMovies,
        name: 'Popular movies',
      },
    ];
  }
}
