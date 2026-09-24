import { logger } from '@logger';
import {
  MANAGEMENT_PROTOCOL_VERSION,
  SERVICE_MANIFEST_PATH,
  serviceConfigApplyResultSchema,
  serviceConfigSchemaSchema,
  type ServiceConfigTestResult,
  serviceConfigTestResultSchema,
  type ServiceManifest,
  serviceManifestSchema,
  type ServiceStatus,
  serviceStatusSchema,
} from '@miauflix/service-contracts';
import type { ZodType } from 'zod';

import { ServiceNotConfiguredError } from '@errors/service-not-configured.error';
import type { ServiceInstanceStatus } from '@mytypes/configuration';
import type { ConfigurationService } from '@services/configuration/configuration.service';
import type { ServiceName } from '@services/configuration/configuration.types';

const POLL_INTERVAL_MS = 15_000;

export interface RemoteServiceDescriptor {
  serviceName: ServiceName;
  urlKey: string;
  timeoutKey: string;
  capability: string;
  capabilityVersion: number;
}

export class RemoteServiceManager {
  readonly testable = true;
  private manifest: ServiceManifest | null = null;
  private statusEventsPath: string | null = null;
  private status: ServiceInstanceStatus = {
    status: 'initializing',
    details: 'Discovering remote service',
    startedAt: Date.now(),
  };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private streamAbort: AbortController | null = null;
  private streamTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly statusListeners = new Set<(status: ServiceInstanceStatus) => void>();

  constructor(
    private readonly configuration: ConfigurationService,
    private readonly descriptor: RemoteServiceDescriptor
  ) {}

  getStatus(): ServiceInstanceStatus {
    return this.status;
  }

  isReady(): boolean {
    return this.status.status === 'ready';
  }

  subscribeStatus(listener: (status: ServiceInstanceStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  async requestCapability<T>(
    schema: ZodType<T>,
    path: string,
    options: RequestInit & { notFound?: () => T } = {}
  ): Promise<T> {
    if (!this.isReady()) throw new ServiceNotConfiguredError(this.descriptor.serviceName);
    return this.request(schema, path, options);
  }

  get capabilityBasePath(): string {
    const capability = this.manifest?.capabilities[this.descriptor.capability];
    if (!capability) throw new Error(`Capability '${this.descriptor.capability}' is unavailable`);
    return capability.basePath;
  }

  async initialize(): Promise<void> {
    await this.discover().catch(error => {
      this.manifest = null;
      this.markUnavailable(error);
    });
    this.schedulePoll();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.streamTimer) clearTimeout(this.streamTimer);
    this.streamAbort?.abort();
  }

  async reload(): Promise<void> {
    if (!this.manifest) {
      // Discovery itself pushes the complete snapshot before reporting status.
      await this.discover();
      return;
    }
    const snapshot = this.configuration.getServiceConfigSnapshot(this.descriptor.serviceName);
    if (snapshot)
      await this.applyConfiguration(
        Object.entries(snapshot).map(([key, value]) => ({ key, value }))
      );
    else await this.refreshStatus();
  }

  /**
   * Probe the remote service with the current (possibly draft) values without
   * applying them. This is intentionally separate from reload(), which only
   * refreshes discovery metadata and lifecycle status.
   */
  async testConfiguration(
    entries?: { key: string; value: string }[]
  ): Promise<ServiceConfigTestResult> {
    if (!this.manifest) await this.discover();
    if (!this.manifest) throw new Error('Remote service has not been discovered');
    const values = entries
      ? Object.fromEntries(entries.map(({ key, value }) => [key, value]))
      : this.configuration.getServiceConfigSnapshot(this.descriptor.serviceName);
    if (!values) {
      return {
        success: false,
        mode: 'validation',
        message: `Stored configuration snapshot for ${this.descriptor.serviceName} is unavailable`,
        invalidKeys: [],
      };
    }
    return this.request(
      serviceConfigTestResultSchema,
      this.manifest.management.configurationTestPath,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          values,
        }),
      }
    );
  }

  async applyConfiguration(
    entries: { key: string; value: string }[]
  ): Promise<{ success: boolean; message?: string; invalidKeys?: string[] }> {
    return this.applyConfigurationSnapshot(entries, true);
  }

  private async applyConfigurationSnapshot(
    entries: { key: string; value: string }[],
    refreshStatus: boolean
  ): Promise<{ success: boolean; message?: string; invalidKeys?: string[] }> {
    if (!this.manifest) await this.discover();
    if (!this.manifest) throw new Error('Remote service has not been discovered');
    const result = await this.request(
      serviceConfigApplyResultSchema,
      this.manifest.management.configurationApplyPath,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          values: Object.fromEntries(entries.map(({ key, value }) => [key, value])),
        }),
        acceptConfigurationRejection: true,
      }
    );
    if (result.success && refreshStatus) await this.refreshStatus();
    return {
      success: result.success,
      message:
        result.test?.message ??
        (result.invalidKeys?.length
          ? `Rejected keys: ${result.invalidKeys.join(', ')}`
          : undefined),
      invalidKeys: result.invalidKeys,
    };
  }

  async clearConfiguration(): Promise<{
    success: boolean;
    message?: string;
    invalidKeys?: string[];
  }> {
    if (!this.manifest) await this.discover();
    if (!this.manifest) throw new Error('Remote service has not been discovered');
    const result = await this.request(
      serviceConfigApplyResultSchema,
      this.manifest.management.configurationApplyPath,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true }),
        acceptConfigurationRejection: true,
      }
    );
    if (result.success) await this.refreshStatus();
    return {
      success: result.success,
      message:
        result.test?.message ??
        (result.invalidKeys?.length
          ? `Rejected keys: ${result.invalidKeys.join(', ')}`
          : undefined),
      invalidKeys: result.invalidKeys,
    };
  }

  async request<T>(
    schema: ZodType<T>,
    path: string,
    options: RequestInit & {
      notFound?: () => T;
      acceptConfigurationRejection?: boolean;
    } = {}
  ): Promise<T> {
    const { notFound, acceptConfigurationRejection, ...requestOptions } = options;
    const baseUrl = String(this.configuration.getDynamic(this.descriptor.urlKey) ?? '').replace(
      /\/+$/,
      ''
    );
    if (!baseUrl) throw new Error(`${this.descriptor.urlKey} is not configured`);
    const timeoutMs = Number(this.configuration.getDynamic(this.descriptor.timeoutKey) ?? 120_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const signal = requestOptions.signal
      ? AbortSignal.any([requestOptions.signal, controller.signal])
      : controller.signal;

    try {
      const response = await fetch(new URL(path, `${baseUrl}/`), { ...requestOptions, signal });
      if (response.status === 404 && notFound) {
        await response.body?.cancel().catch(() => undefined);
        return notFound();
      }
      if (response.status === 503) {
        await response.body?.cancel().catch(() => undefined);
        throw new ServiceNotConfiguredError(this.descriptor.serviceName);
      }
      const body = await response.json().catch(() => null);
      if (!response.ok && !(acceptConfigurationRejection && response.status === 400)) {
        throw new Error(
          `${this.descriptor.serviceName} request failed: ${response.status} ${JSON.stringify(body)}`
        );
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        throw new Error(
          `${this.descriptor.serviceName} returned an invalid contract payload: ${parsed.error.message}`
        );
      }
      return parsed.data;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`${this.descriptor.serviceName} request timed out after ${timeoutMs}ms`, {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async discover(): Promise<void> {
    const manifest = await this.request(serviceManifestSchema, SERVICE_MANIFEST_PATH);
    if (manifest.managementProtocolVersion !== MANAGEMENT_PROTOCOL_VERSION) {
      throw new Error(
        `Unsupported management protocol v${manifest.managementProtocolVersion}; expected v${MANAGEMENT_PROTOCOL_VERSION}`
      );
    }
    const capability = manifest.capabilities[this.descriptor.capability];
    if (!capability) {
      throw new Error(`Service does not provide '${this.descriptor.capability}'`);
    }
    if (capability.version !== this.descriptor.capabilityVersion) {
      throw new Error(
        `Unsupported ${this.descriptor.capability} contract v${capability.version}; expected v${this.descriptor.capabilityVersion}`
      );
    }
    const schema = await this.request(
      serviceConfigSchemaSchema,
      manifest.management.configurationSchemaPath
    );
    this.manifest = manifest;
    this.statusEventsPath = manifest.management.statusEventsPath ?? null;
    this.configuration.registerRemoteConfiguration(this.descriptor.serviceName, schema);
    const snapshot = this.configuration.getServiceConfigSnapshot(this.descriptor.serviceName);
    if (snapshot) {
      try {
        const applied = await this.applyConfigurationSnapshot(
          Object.entries(snapshot).map(([key, value]) => ({ key, value })),
          false
        );
        if (!applied.success) this.logConfigurationRejection(applied);
      } catch (error) {
        logger.warn(
          'RemoteService',
          `${this.descriptor.serviceName} could not apply its stored configuration during discovery`,
          error
        );
      }
    }
    await this.refreshStatus();
    this.startStatusStream();
    logger.info(
      'RemoteService',
      `Discovered ${manifest.name} ${manifest.version} (${this.descriptor.capability} v${capability.version})`
    );
  }

  private async refreshStatus(): Promise<void> {
    if (!this.manifest) return;
    const remote = await this.request(serviceStatusSchema, this.manifest.management.statusPath);
    this.setStatus(this.toLocalStatus(remote));
    // A service process restart returns it to standby while this manager remains
    // alive. Re-deliver its complete backend-owned snapshot before the next poll.
    if (remote.state === 'standby') {
      const snapshot = this.configuration.getServiceConfigSnapshot(this.descriptor.serviceName);
      if (snapshot) {
        try {
          const applied = await this.applyConfigurationSnapshot(
            Object.entries(snapshot).map(([key, value]) => ({ key, value })),
            false
          );
          if (!applied.success) this.logConfigurationRejection(applied);
        } catch (error) {
          logger.warn(
            'RemoteService',
            `${this.descriptor.serviceName} rejected its stored configuration during standby recovery`,
            error
          );
        }
      }
    }
  }

  private logConfigurationRejection(result: { message?: string; invalidKeys?: string[] }): void {
    logger.warn(
      'RemoteService',
      `${this.descriptor.serviceName} rejected its stored configuration${result.invalidKeys?.length ? ` (${result.invalidKeys.join(', ')})` : ''}: ${result.message ?? 'configuration validation failed'}`
    );
  }

  private setStatus(status: ServiceInstanceStatus): void {
    const changed = JSON.stringify(this.status) !== JSON.stringify(status);
    this.status = status;
    if (changed) for (const listener of this.statusListeners) listener(status);
  }

  private startStatusStream(): void {
    if (!this.statusEventsPath || this.stopped || this.streamAbort) return;
    const controller = new AbortController();
    this.streamAbort = controller;
    void (async () => {
      try {
        const response = await this.requestRaw(this.statusEventsPath!, controller.signal);
        if (!response.body) throw new Error('Status event stream returned no body');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const events = buffer.split(/\r\n\r\n|\n\n|\r\r/);
          buffer = events.pop() ?? '';
          for (const event of events) {
            const data = event
              .split(/\r\n|\n|\r/)
              .find(line => line.startsWith('data:'))
              ?.slice(5)
              .trim();
            if (!data) continue;
            const parsed = serviceStatusSchema.parse(JSON.parse(data));
            this.setStatus(this.toLocalStatus(parsed));
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          // The event stream is an optimization for prompt status updates. Its
          // transport can fail independently of the service itself (for
          // example, when a proxy closes an idle SSE connection), so retain
          // the last status and let the regular status poll remain authoritative.
          logger.debug(
            'RemoteService',
            `${this.descriptor.serviceName} status stream disconnected; reconnecting`,
            error
          );
        }
      } finally {
        this.streamAbort = null;
        if (!this.stopped)
          this.streamTimer = setTimeout(() => {
            this.streamTimer = null;
            this.startStatusStream();
          }, POLL_INTERVAL_MS);
      }
    })();
  }

  private async requestRaw(path: string, signal: AbortSignal): Promise<Response> {
    const baseUrl = String(this.configuration.getDynamic(this.descriptor.urlKey) ?? '').replace(
      /\/+$/,
      ''
    );
    if (!baseUrl) throw new ServiceNotConfiguredError(this.descriptor.serviceName);
    const response = await fetch(new URL(path, `${baseUrl}/`), {
      signal,
      headers: { Accept: 'text/event-stream' },
    });
    if (!response.ok)
      throw new Error(`${this.descriptor.serviceName} status stream failed: ${response.status}`);
    return response;
  }

  private toLocalStatus(remote: ServiceStatus): ServiceInstanceStatus {
    if (remote.state === 'ready') return { status: 'ready' };
    if (remote.state === 'degraded')
      return { status: 'degraded', reason: remote.message ?? 'Degraded' };
    if (remote.state === 'error') {
      return {
        status: 'error',
        errorMessage: remote.message ?? remote.errorCode ?? 'Remote service error',
        error: null,
      };
    }
    if (remote.state === 'standby' && remote.missingConfiguration?.length) {
      return {
        status: 'error',
        errorMessage: `Waiting for configuration: ${remote.missingConfiguration.join(', ')}`,
        error: null,
      };
    }
    return {
      status: 'initializing',
      details: remote.missingConfiguration?.length
        ? `Waiting for configuration: ${remote.missingConfiguration.join(', ')}`
        : (remote.message ?? 'Remote service is configuring'),
      startedAt: Date.now(),
    };
  }

  private schedulePoll(): void {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      try {
        if (this.manifest) await this.refreshStatus();
        else await this.discover();
      } catch (error) {
        this.markUnavailable(error);
        this.manifest = null;
      } finally {
        this.schedulePoll();
      }
    }, POLL_INTERVAL_MS);
  }

  private markUnavailable(error: unknown): void {
    this.setStatus({
      status: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
      error: null,
    });
    logger.warn('RemoteService', `${this.descriptor.serviceName} discovery/status failed`, error);
  }
}
