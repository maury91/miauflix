export type {
  ServiceConfigSchema as CatalogConfigSchema,
  ServiceConfigTestResult as CatalogConfigTestResult,
  ConfigVariable as CatalogConfigVariableSchema,
  ServiceConfigApplyResult as CatalogConfigWriteResult,
  ServiceStatus as CatalogStatus,
} from '@miauwatch/contract';
export type {
  BatchResponse,
  EpisodeDetail,
  EpisodeLayout,
  EpisodeLayoutEntry,
  ExternalMediaLookup,
  LocalizedGenre,
  MediaRef,
  MediaSummary,
  MediaType,
  MovieDetail,
  SeasonDetail,
  SeasonSummary,
  TVShowDetail,
} from '@miauwatch/service-contracts';

export class CatalogUnavailableError extends Error {
  constructor(message = 'Media catalog service is unreachable') {
    super(message);
    this.name = 'CatalogUnavailableError';
  }
}
