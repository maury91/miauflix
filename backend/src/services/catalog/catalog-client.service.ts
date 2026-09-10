import {
  type BatchResponse,
  batchResponseSchema,
  CATALOG_CAPABILITY,
  CATALOG_CAPABILITY_VERSION,
  type ListDefinition,
  listDefinitionSchema,
  type ListPage,
  listPageSchema,
  type MediaRef,
  type MovieDetail,
  movieDetailSchema,
  okResponseSchema,
  type SeasonDetail,
  seasonDetailSchema,
  type ServiceConfigTestResult,
  type TVShowDetail,
  tvShowDetailSchema,
} from '@miauflix/service-contracts';
import type { ZodType } from 'zod';

import type { ConfigurableService, ServiceInstanceStatus } from '@mytypes/configuration';
import type { ConfigurationService } from '@services/configuration/configuration.service';
import { RemoteServiceManager } from '@services/remote/remote-service.manager';

/** Typed catalog capability adapter over a discovered remote service. */
export class CatalogClientService implements ConfigurableService {
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly remote: RemoteServiceManager;
  testable: boolean;

  constructor(readonly configurationService: ConfigurationService) {
    this.remote = new RemoteServiceManager(configurationService, {
      serviceName: 'CATALOG',
      urlKey: 'CATALOG_SERVICE_URL',
      timeoutKey: 'CATALOG_SERVICE_TIMEOUT_MS',
      capability: CATALOG_CAPABILITY,
      capabilityVersion: CATALOG_CAPABILITY_VERSION,
    });
    this.testable = this.remote.testable;
  }

  initialize(): Promise<void> {
    return this.remote.initialize();
  }

  stop(): void {
    return this.remote.stop();
  }

  getStatus(): ServiceInstanceStatus {
    return this.remote.getStatus();
  }

  reload(): Promise<void> {
    return this.remote.reload();
  }

  testConfiguration(): Promise<ServiceConfigTestResult> {
    return this.remote.testConfiguration();
  }

  async getMovie(mediaId: number, language: string): Promise<MovieDetail | null> {
    return this.get(movieDetailSchema.nullable(), `/movie/${mediaId}`, { language }, () => null);
  }

  async getTVShow(mediaId: number, language: string): Promise<TVShowDetail | null> {
    return this.get(tvShowDetailSchema.nullable(), `/tv/${mediaId}`, { language }, () => null);
  }

  async getSeason(
    tvMediaId: number,
    seasonNumber: number,
    language: string
  ): Promise<SeasonDetail | null> {
    return this.get(
      seasonDetailSchema.nullable(),
      `/tv/${tvMediaId}/season/${seasonNumber}`,
      { language },
      () => null
    );
  }

  async getListPage(slug: string, page: number): Promise<ListPage> {
    return this.get(listPageSchema, `/lists/${encodeURIComponent(slug)}`, { page: String(page) });
  }

  async getListDefinitions(): Promise<ListDefinition[]> {
    return this.get(listDefinitionSchema.array(), '/lists');
  }

  async batch(items: MediaRef[], language: string): Promise<BatchResponse> {
    return this.remote.request(batchResponseSchema, this.path('/media/batch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, language }),
    });
  }

  async setWatching(mediaIds: number[]): Promise<void> {
    await this.remote.request(okResponseSchema, this.path('/watching'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaIds }),
    });
  }

  private get<T>(
    schema: ZodType<T>,
    path: string,
    query: Record<string, string> = {},
    notFound?: () => T
  ): Promise<T> {
    const params = new URLSearchParams(query);
    const requestPath = `${this.path(path)}${params.size ? `?${params}` : ''}`;
    const existing = this.inflight.get(requestPath) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = this.remote.request(schema, requestPath, { notFound }).finally(() => {
      this.inflight.delete(requestPath);
    });
    this.inflight.set(requestPath, promise);
    return promise;
  }

  private path(path: string): string {
    return `${this.remote.capabilityBasePath.replace(/\/+$/, '')}${path}`;
  }
}
