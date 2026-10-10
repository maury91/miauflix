import {
  type ArtworkPriority,
  artworkQueueResponseSchema,
  artworkSnapshotResponseSchema,
  type ArtworkUpdate,
  artworkUpdateSchema,
  backdropFocusBackgroundResponseSchema,
  backdropFocusResponseSchema,
  type BatchResponse,
  batchResponseSchema,
  CATALOG_CAPABILITY,
  CATALOG_CAPABILITY_VERSION,
  type ExternalMediaLookup,
  externalMediaResolveResponseSchema,
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

import { ServiceNotConfiguredError } from '@errors/service-not-configured.error';
import type { ConfigurableService, ServiceInstanceStatus } from '@mytypes/configuration';
import type { ConfigurationService } from '@services/configuration/configuration.service';
import { RemoteServiceManager } from '@services/remote/remote-service.manager';

/** Typed catalog capability adapter over a discovered remote service. */
export class CatalogClientService implements ConfigurableService {
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly remote: RemoteServiceManager;
  private readonly artworkListeners = new Set<(update: ArtworkUpdate) => void>();
  private readonly artworkStreamReadyListeners = new Set<() => void>();
  private artworkAbort: AbortController | null = null;
  private artworkRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private artworkRetryMs = 500;
  private removeArtworkStatusListener: (() => void) | null = null;
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
    this.removeArtworkStatusListener = this.remote.subscribeStatus(status => {
      if (status.status === 'ready') this.connectArtworkEvents();
      else this.disconnectArtworkEvents();
    });
  }

  initialize(): Promise<void> {
    return this.remote.initialize();
  }

  stop(): void {
    this.disconnectArtworkEvents();
    this.removeArtworkStatusListener?.();
    this.removeArtworkStatusListener = null;
    return this.remote.stop();
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

  reload(): Promise<void> {
    return this.remote.reload();
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

  async batch(
    items: MediaRef[],
    language: string,
    artworkPriority: 'background' | 'prefetch' | 'returned' = 'returned'
  ): Promise<BatchResponse> {
    return this.remote.requestCapability(batchResponseSchema, this.path('/media/batch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, language, artworkPriority }),
    });
  }

  async queueArtwork(items: MediaRef[], priority: ArtworkPriority): Promise<number> {
    const response = await this.remote.requestCapability(
      artworkQueueResponseSchema,
      this.path('/media/artwork/queue'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, priority }),
      }
    );
    return response.accepted;
  }

  async artworkSnapshot(items: MediaRef[]): Promise<ArtworkUpdate[]> {
    const response = await this.remote.requestCapability(
      artworkSnapshotResponseSchema,
      this.path('/media/artwork/snapshot'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      }
    );
    return response.updates;
  }

  onArtwork(listener: (update: ArtworkUpdate) => void): () => void {
    this.artworkListeners.add(listener);
    this.connectArtworkEvents();
    return () => {
      this.artworkListeners.delete(listener);
      if (!this.artworkListeners.size) this.disconnectArtworkEvents();
    };
  }

  onArtworkStreamReady(listener: () => void): () => void {
    this.artworkStreamReadyListeners.add(listener);
    return () => this.artworkStreamReadyListeners.delete(listener);
  }

  /**
   * Requests cached or newly computed normalized backdrop focus using the catalog media ID.
   * Rejects with ServiceNotConfiguredError when the catalog is not ready or returns 503.
   * Network, timeout, other HTTP errors (including 404), and invalid response errors propagate.
   */
  async ensureBackdropFocus(
    mediaType: 'movie' | 'tv',
    mediaId: number
  ): Promise<{ x: number; y: number }> {
    const response = await this.remote.requestCapability(
      backdropFocusResponseSchema,
      this.path(`/media/${mediaType}/${mediaId}/backdrop-focus`),
      { method: 'POST' }
    );
    return response.backdropFocus;
  }

  async queueBackdropFocus(items: MediaRef[]): Promise<number> {
    const response = await this.remote.requestCapability(
      backdropFocusBackgroundResponseSchema,
      this.path('/media/backdrop-focus/background'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      }
    );
    return response.accepted;
  }

  async resolveExternal(
    items: ExternalMediaLookup[]
  ): Promise<Array<{ requested: ExternalMediaLookup; media: MediaRef | null }>> {
    const response = await this.remote.requestCapability(
      externalMediaResolveResponseSchema,
      this.path('/media/resolve'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      }
    );
    return response.items;
  }

  async setWatching(mediaIds: number[]): Promise<void> {
    await this.remote.requestCapability(okResponseSchema, this.path('/watching'), {
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
    const promise = this.remote.requestCapability(schema, requestPath, { notFound }).finally(() => {
      this.inflight.delete(requestPath);
    });
    this.inflight.set(requestPath, promise);
    return promise;
  }

  private path(path: string): string {
    if (!this.remote.isReady()) throw new ServiceNotConfiguredError('CATALOG');
    return `${this.remote.capabilityBasePath.replace(/\/+$/, '')}${path}`;
  }

  private connectArtworkEvents(): void {
    if (!this.artworkListeners.size || !this.remote.isReady() || this.artworkAbort) return;
    const baseUrl = String(
      this.configurationService.getDynamic('CATALOG_SERVICE_URL') ?? ''
    ).replace(/\/+$/, '');
    if (!baseUrl) return;
    const controller = new AbortController();
    this.artworkAbort = controller;
    void this.readArtworkEvents(controller, baseUrl);
  }

  private disconnectArtworkEvents(): void {
    if (this.artworkRetryTimer) clearTimeout(this.artworkRetryTimer);
    this.artworkRetryTimer = null;
    this.artworkAbort?.abort();
    this.artworkAbort = null;
  }

  private async readArtworkEvents(controller: AbortController, baseUrl: string): Promise<void> {
    try {
      const path = `${this.remote.capabilityBasePath.replace(/\/+$/, '')}/media/artwork/events`;
      const response = await fetch(new URL(path, `${baseUrl}/`), {
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      if (!response.ok || !response.body)
        throw new Error(`Artwork feed returned ${response.status}`);
      this.artworkRetryMs = 500;
      for (const listener of this.artworkStreamReadyListeners) listener();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of frame.split(/\r?\n/)) {
            if (!line.startsWith('data:')) continue;
            let payload: unknown;
            try {
              payload = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            const parsed = artworkUpdateSchema.safeParse(payload);
            if (parsed.success) {
              for (const listener of this.artworkListeners) listener(parsed.data);
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
      await reader.cancel().catch(() => undefined);
    } catch {
      // Reconnect below. Aborts are intentional during configuration changes and shutdown.
    } finally {
      if (this.artworkAbort !== controller) return;
      this.artworkAbort = null;
      if (!controller.signal.aborted && this.artworkListeners.size && this.remote.isReady()) {
        const delay = this.artworkRetryMs + Math.floor(Math.random() * 250);
        this.artworkRetryMs = Math.min(8_000, this.artworkRetryMs * 2);
        this.artworkRetryTimer = setTimeout(() => {
          this.artworkRetryTimer = null;
          this.connectArtworkEvents();
        }, delay);
      }
    }
  }
}
