import {
  type ConnectionResult,
  lists,
  type ListServiceDefinition,
  type ListServiceDefinitionsPage,
  type ListServicePage,
  type PlaybackEntry,
  type PlaybackProgress,
  type ProviderAssociation,
  type ProviderAuthorization,
} from '@miauflix/service-contracts';

import type { ConfigurationService } from '@services/configuration/configuration.service';
import { RemoteService } from '@services/remote/remote-service';

/** The list service, with the backend's calling conventions. */
export class ListClientService extends RemoteService<typeof lists> {
  constructor(configurationService: ConfigurationService) {
    super(configurationService, {
      serviceName: 'LIST',
      urlKey: 'LIST_SERVICE_URL',
      timeoutKey: 'LIST_SERVICE_TIMEOUT_MS',
      contract: lists,
    });
  }

  getDefinitions(subjectId: string): Promise<ListServiceDefinition[]> {
    return this.client.definitions({ subjectId });
  }

  getPopularDefinitions(page: number, limit: number): Promise<ListServiceDefinitionsPage> {
    return this.client.popularDefinitions({ page, limit });
  }

  getPage(subjectId: string, listId: string, page: number): Promise<ListServicePage> {
    return this.client.page({ subjectId, listId, page });
  }

  beginTraktConnection(subjectId: string): Promise<ProviderAuthorization> {
    return this.client.beginTraktConnection({ subjectId });
  }

  checkTraktConnection(subjectId: string, authorizationId: string): Promise<ConnectionResult> {
    return this.client.checkTraktConnection({ subjectId, authorizationId });
  }

  getTraktAssociation(subjectId: string): Promise<ProviderAssociation> {
    return this.client.traktAssociation({ subjectId });
  }

  async disconnectTrakt(subjectId: string): Promise<void> {
    await this.client.disconnectTrakt({ subjectId });
  }

  /**
   * Submit progress for a backend user ID to the list service’s export queue.
   * A successful response does not guarantee a connected account or delivery to Trakt.
   */
  async syncPlayback(subjectId: string, progress: PlaybackProgress): Promise<void> {
    await this.client.syncPlayback({ subjectId, progress });
  }

  /** Read the list service’s cached playback snapshot for a backend user ID. */
  getPlayback(subjectId: string): Promise<PlaybackEntry[]> {
    return this.client.playback({ subjectId });
  }

  async syncWatchlist(
    subjectId: string,
    update: { mediaType: 'movie' | 'tv'; mediaId: number; operation: 'add' | 'remove' }
  ): Promise<void> {
    await this.client.syncWatchlist({ subjectId, ...update });
  }
}
