import { Controller, Get, Param } from '@nestjs/common';
import { ShowsService } from './shows.service';

@Controller('shows')
export class ShowsController {
  constructor(private readonly tvService: ShowsService) {}

  @Get(':slug')
  async getShow(@Param('slug') slug: string) {
    return this.tvService.getShow(slug);
  }
}
