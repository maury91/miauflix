import { Controller, Get, Param } from '@nestjs/common';
import { ShowsService } from './shows.service';

@Controller('shows')
export class ShowsController {
  constructor(private readonly showsService: ShowsService) {}

  @Get(':slug')
  async getShow(@Param('slug') slug: string) {
    return this.showsService.getShow(slug);
  }

  @Get(':slug/seasons')
  async getSeasons(@Param('slug') slug: string) {
    return this.showsService.getShowSeasons(slug);
  }
}
