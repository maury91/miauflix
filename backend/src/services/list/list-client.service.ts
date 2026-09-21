import type { ServiceConfigTestResult } from '@miauflix/service-contracts';
import {
  type ConnectionResult,
  connectionResultSchema,
  LIST_CAPABILITY,
  LIST_CAPABILITY_VERSION,
  type ListServiceDefinition,
  listServiceDefinitionSchema,
  type ListServicePage,
  listServicePageSchema,
  type ProviderAssociation,
  providerAssociationSchema,
  type ProviderAuthorization,
  providerAuthorizationSchema,
} from '@miauflix/service-contracts';
import type { ZodType } from 'zod';

import type { ServiceInstanceStatus } from '@mytypes/configuration';
import type { ConfigurationService } from '@services/configuration/configuration.service';
import { RemoteServiceManager } from '@services/remote/remote-service.manager';

export class ListClientService {
  private readonly remote: RemoteServiceManager;
  readonly testable: boolean;

  constructor(readonly configurationService: ConfigurationService) {
    this.remote = new RemoteServiceManager(configurationService, {
      serviceName: 'LIST',
      urlKey: 'LIST_SERVICE_URL',
      timeoutKey: 'LIST_SERVICE_TIMEOUT_MS',
      capability: LIST_CAPABILITY,
      capabilityVersion: LIST_CAPABILITY_VERSION,
    });
    this.testable = this.remote.testable;
  }

  initialize(): Promise<void> {
    return this.remote.initialize();
  }

  stop(): void {
    this.remote.stop();
  }

  reload(): Promise<void> {
    return this.remote.reload();
  }

  getStatus(): ServiceInstanceStatus {
    return this.remote.getStatus();
  }

  isReady(): boolean {
    return this.remote.isReady();
  }

  subscribeStatus(listener: (status: ServiceInstanceStatus) => void): () => void {
    return this.remote.subscribeStatus(listener);
  }

  testConfiguration(): Promise<ServiceConfigTestResult> {
    return this.remote.testConfiguration();
  }

  getDefinitions(subjectId: string): Promise<ListServiceDefinition[]> {
    return this.get(listServiceDefinitionSchema.array(), '/lists', { subjectId });
  }

  getPage(subjectId: string, listId: string, page: number): Promise<ListServicePage> {
    return this.get(listServicePageSchema, `/lists/${encodeURIComponent(listId)}`, {
      subjectId,
      page: String(page),
    });
  }

  beginTraktConnection(subjectId: string): Promise<ProviderAuthorization> {
    return this.remote.requestCapability(
      providerAuthorizationSchema,
      this.path('/connections/trakt/device'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId }),
      }
    );
  }

  checkTraktConnection(subjectId: string, authorizationId: string): Promise<ConnectionResult> {
    return this.remote.requestCapability(
      connectionResultSchema,
      this.path(`/connections/trakt/device/${encodeURIComponent(authorizationId)}`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId }),
      }
    );
  }

  getTraktAssociation(subjectId: string): Promise<ProviderAssociation> {
    return this.remote.requestCapability(
      providerAssociationSchema,
      this.path(`/connections/trakt/${encodeURIComponent(subjectId)}`)
    );
  }

  async disconnectTrakt(subjectId: string): Promise<void> {
    await this.remote.requestCapability(
      providerAssociationSchema,
      this.path(`/connections/trakt/${encodeURIComponent(subjectId)}`),
      { method: 'DELETE' }
    );
  }

  private get<T>(schema: ZodType<T>, path: string, query: Record<string, string>): Promise<T> {
    const params = new URLSearchParams(query);
    return this.remote.requestCapability(schema, `${this.path(path)}?${params.toString()}`);
  }

  private path(path: string): string {
    return `${this.remote.capabilityBasePath.replace(/\/+$/, '')}${path}`;
  }
}
