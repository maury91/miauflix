import { Controller, Get, Param } from '@nestjs/common';
import { JackettService } from './jackett.service';

@Controller('jackett')
export class JackettController {
  constructor(private readonly jackettService: JackettService) {}

  @Get()
  getAllTrackers() {
    return this.jackettService.getAllTrackers();
  }

  @Get('anime')
  getAnimeTrackers() {
    return this.jackettService.getTrackersByCategory('anime');
  }

  @Get('movie')
  getMovieTrackers() {
    return this.jackettService.getTrackersByCategory('movie');
  }

  @Get('tv')
  getTvTrackers() {
    return this.jackettService.getTrackersByCategory('tv');
  }
}
