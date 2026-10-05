import type { ServiceConfigTestResult } from '@miauflix/service-contracts';
import {
  type ConnectionResult,
  connectionResultSchema,
  LIST_CAPABILITY,
  LIST_CAPABILITY_VERSION,
  type ListServiceDefinition,
  listServiceDefinitionSchema,
  type ListServiceDefinitionsPage,
  listServiceDefinitionsPageSchema,
  type ListServicePage,
  listServicePageSchema,
  type PlaybackEntry,
  type PlaybackProgress,
  playbackSnapshotSchema,
  type ProviderAssociation,
  providerAssociationSchema,
  type ProviderAuthorization,
  providerAuthorizationSchema,
} from '@miauflix/service-contracts';
import { z, type ZodType } from 'zod';

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

  testConfiguration(entries?: { key: string; value: string }[]): Promise<ServiceConfigTestResult> {
    return this.remote.testConfiguration(entries);
  }

  applyConfiguration(
    entries: { key: string; value: string }[]
  ): Promise<{ success: boolean; message?: string; invalidKeys?: string[] }> {
    return this.remote.applyConfiguration(entries);
  }

  clearConfiguration(): Promise<{ success: boolean; message?: string; invalidKeys?: string[] }> {
    return this.remote.clearConfiguration();
  }

  getDefinitions(subjectId: string): Promise<ListServiceDefinition[]> {
    return this.get(listServiceDefinitionSchema.array(), '/lists', { subjectId });
  }

  getPopularDefinitions(page: number, limit: number): Promise<ListServiceDefinitionsPage> {
    return this.get(listServiceDefinitionsPageSchema, '/lists/popular', {
      page: String(page),
      limit: String(limit),
    });
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

  /**
   * Submit progress for a backend user ID to the list service’s export queue.
   * A successful response does not guarantee a connected account or delivery to Trakt.
   * Service availability, request, and response validation failures propagate.
   */
  async syncPlayback(subjectId: string, update: PlaybackProgress): Promise<void> {
    await this.remote.requestCapability(z.object({ synced: z.boolean() }), this.path('/progress'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectId, ...update }),
    });
  }

  /**
   * Read the list service’s cached playback snapshot for a backend user ID.
   * Service availability, request, and response validation failures propagate.
   */
  async getPlayback(subjectId: string): Promise<PlaybackEntry[]> {
    const result = await this.get(playbackSnapshotSchema, '/progress', { subjectId });
    return result.progress;
  }

  private get<T>(schema: ZodType<T>, path: string, query: Record<string, string>): Promise<T> {
    const params = new URLSearchParams(query);
    return this.remote.requestCapability(schema, `${this.path(path)}?${params.toString()}`);
  }

  private path(path: string): string {
    return `${this.remote.capabilityBasePath.replace(/\/+$/, '')}${path}`;
  }
}
