import {
  type ProviderView,
  type RepositoryView,
  sources,
  type SourceSearchItem,
  type SourceSearchRequest,
} from '@miauflix/service-contracts';

import type { ConfigurationService } from '@services/configuration/configuration.service';
import { RemoteService } from '@services/remote/remote-service';

/** Backend access to source websites is exclusively mediated by this service. */
export class SourcesClientService extends RemoteService<typeof sources> {
  constructor(configuration: ConfigurationService) {
    super(configuration, {
      serviceName: 'SOURCES',
      urlKey: 'SOURCES_SERVICE_URL',
      timeoutKey: 'SOURCES_SERVICE_TIMEOUT_MS',
      contract: sources,
    });
  }

  search(request: SourceSearchRequest, signal?: AbortSignal): AsyncIterable<SourceSearchItem> {
    return this.client.search(request, { signal });
  }

  async torrentFile(hash: string, fileRef?: string): Promise<Buffer | null> {
    const result = await this.client.torrentFile({ hash, fileRef });
    return result === null ? null : Buffer.from(result, 'base64');
  }

  providers(): Promise<ProviderView[]> {
    return this.client.providers();
  }

  updateProvider(input: {
    id: string;
    enabled?: boolean;
    priority?: number;
    settings?: Record<string, boolean | string>;
  }): Promise<ProviderView> {
    return this.client.updateProvider(input);
  }

  reorderProviders(ids: string[]): Promise<ProviderView[]> {
    return this.client.reorderProviders({ ids });
  }

  testProvider(id: string): Promise<{ success: boolean; message: string }> {
    return this.client.testProvider({ id });
  }

  repositories(): Promise<RepositoryView[]> {
    return this.client.repositories();
  }

  addRepository(url: string): Promise<RepositoryView> {
    return this.client.addRepository({ url });
  }

  removeRepository(id: string): Promise<void> {
    return this.client.removeRepository({ id });
  }

  refreshRepository(id: string): Promise<RepositoryView> {
    return this.client.refreshRepository({ id });
  }
}
