export type {
  BatchResponse,
  EpisodeDetail,
  ExternalMediaLookup,
  LocalizedGenre,
  MediaRef,
  MediaSummary,
  MediaType,
  MovieDetail,
  SeasonDetail,
  SeasonSummary,
  TVShowDetail,
} from '@miauflix/service-contracts';
export type {
  ServiceConfigSchema as CatalogConfigSchema,
  ServiceConfigTestResult as CatalogConfigTestResult,
  ServiceConfigState as CatalogConfigValues,
  ConfigVariable as CatalogConfigVariableSchema,
  ServiceConfigApplyResult as CatalogConfigWriteResult,
  ServiceStatus as CatalogStatus,
} from '@miauflix/service-contracts';

export class CatalogUnavailableError extends Error {
  constructor(message = 'Media catalog service is unreachable') {
    super(message);
    this.name = 'CatalogUnavailableError';
  }
}
