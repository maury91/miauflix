import type { ScheduleTask } from '@mytypes/scheduler.types';
import { traced } from '@utils/tracing.util';

import type { TmdbService } from './tmdb/tmdb.service';
import type { TranslatedMovie, TranslatedTVShow } from './tmdb/tmdb.types';
import type { TraktService } from './trakt/trakt.service';

export class ContentCatalogService {
  constructor(
    private readonly tmdbService: TmdbService,
    private readonly traktService: TraktService
  ) {}

  @traced('ContentCatalogService')
  public async getMovieByTmdbId(
    tmdbId: number | string,
    language: string
  ): Promise<TranslatedMovie | null> {
    return this.tmdbService.getMovieInLanguage(tmdbId, language);
  }

  @traced('ContentCatalogService')
  public async getTVShowByTmdbId(
    tmdbId: number | string,
    language: string
  ): Promise<TranslatedTVShow | null> {
    return this.tmdbService.getTVShowInLanguage(tmdbId, language);
  }

  public getSyncTasks(): ScheduleTask[] {
    return [...this.tmdbService.getSyncTasks()];
  }
}
