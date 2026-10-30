import { logger } from '@logger';
import {
  type Client,
  connect,
  type Contract,
  ContractError,
  createClient,
  management,
  type RemoteConnection,
  type ServiceConfigTestResult,
  type ServiceStatus,
  type Transport,
} from '@miauflix/contract';
import WebSocket from 'ws';

import { ServiceNotConfiguredError } from '@errors/service-not-configured.error';
import type { ConfigurableService, ServiceInstanceStatus } from '@mytypes/configuration';
import type { ConfigurationService } from '@services/configuration/configuration.service';
import type { ServiceName } from '@services/configuration/configuration.types';

/**
 * The previous major of the contract and how to serve the current client on top of it, so this
 * backend still works (possibly degraded) with a service one major behind.
 */
export interface PreviousMajor<C extends Contract, P extends Contract = Contract> {
  contract: P;
  adapt: (client: Client<P>) => Client<C>;
}

/** Types an adapter from the previous major's client to the current one. */
export const previousMajor = <C extends Contract, P extends Contract>(
  contract: P,
  adapt: (client: Client<P>) => Client<C>
): PreviousMajor<C> => ({ contract, adapt: adapt as unknown as PreviousMajor<C>['adapt'] });

export interface RemoteServiceDescriptor<C extends Contract> {
  serviceName: ServiceName;
  urlKey: string;
  timeoutKey: string;
  contract: C;
  previous?: PreviousMajor<C>;
}

type ConfigurationResult = { success: boolean; message?: string; invalidKeys?: string[] };

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * A remote service the backend configures and calls: one control-plane connection, the
 * management protocol (configuration schema, snapshot delivery, status) and a typed client.
 */
export class RemoteService<C extends Contract> implements ConfigurableService {
  readonly testable = true;
  private readonly currentClient: Client<C>;
  private readonly previousClient: Client<C> | null;
  private activeClient: Client<C>;
  private readonly connection: RemoteConnection;
  private readonly admin: Client<typeof management>;
  private status: ServiceInstanceStatus = {
    status: 'initializing',
    details: 'Discovering remote service',
    startedAt: Date.now(),
  };
  private discovered = false;
  private discovery: Promise<void> | null = null;
  private readonly statusListeners = new Set<(status: ServiceInstanceStatus) => void>();
  private connectedUrl: string;

  constructor(
    private readonly configuration: ConfigurationService,
    private readonly descriptor: RemoteServiceDescriptor<C>
  ) {
    this.connectedUrl = this.url();
    // The live connection follows the saved URL only (reload() moves it), never a draft overlay.
    this.connection = connect({
      url: () => this.connectedUrl,
      timeoutMs: () => this.timeoutMs(),
      WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
    });
    this.admin = createClient(management, this.connection.transport);
    const gated = this.gatedTransport(this.connection.transport);
    this.currentClient = createClient(descriptor.contract, gated);
    this.previousClient = descriptor.previous
      ? descriptor.previous.adapt(createClient(descriptor.previous.contract, gated))
      : null;
    this.activeClient = this.currentClient;

    this.connection.onState((state, error) => {
      if (state === 'ready') this.runDiscovery();
      else if (state === 'closed') {
        this.discovered = false;
        this.markUnavailable(error ?? new Error('Connection closed'));
      }
    });
    this.connection.onStatus(remote => void this.onRemoteStatus(remote));
  }

  /**
   * Typed client for the major the service speaks (the current one, or the previous one through
   * its adapter). Fails with `ServiceNotConfiguredError` until the service is ready. Subscriptions
   * stay on the major that was active when they were made.
   */
  get client(): Client<C> {
    return this.activeClient;
  }

  private url(): string {
    return String(this.configuration.getDynamic(this.descriptor.urlKey) ?? '').replace(/\/+$/, '');
  }

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

  /** Waits for the first connection attempt so boot logs report the service state. */
  async initialize(): Promise<void> {
    await this.connection.ready(this.timeoutMs()).catch(() => undefined);
    await this.discovery?.catch(() => undefined);
  }

  stop(): void {
    this.connection.close();
  }

  async reload(): Promise<void> {
    if (this.url() !== this.connectedUrl || this.connection.state !== 'ready') {
      this.connectedUrl = this.url();
      this.connection.reconnect();
    }
    await this.connection.ready(this.timeoutMs());
    await this.discovery;
    const snapshot = this.configuration.getServiceConfigSnapshot(this.descriptor.serviceName);
    if (!snapshot) return;
    const applied = await this.applySnapshot(snapshot);
    if (!applied.success) throw this.rejectionError(applied);
  }

  /**
   * Probes the service with the current (possibly draft) values without applying them. A draft
   * service URL is probed over a short-lived connection of its own.
   */
  async testConfiguration(
    entries?: { key: string; value: string }[]
  ): Promise<ServiceConfigTestResult> {
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
    const url = this.url();
    if (url === this.connectedUrl) {
      await this.connection.ready(this.timeoutMs());
      return this.admin.testConfig({ values });
    }
    const probe = connect({
      url,
      timeoutMs: this.timeoutMs(),
      WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
    });
    try {
      await probe.ready(this.timeoutMs());
      return await createClient(management, probe.transport).testConfig({ values });
    } finally {
      probe.close();
    }
  }

  async applyConfiguration(
    entries: { key: string; value: string }[]
  ): Promise<ConfigurationResult> {
    await this.connection.ready(this.timeoutMs());
    return this.applySnapshot(Object.fromEntries(entries.map(({ key, value }) => [key, value])));
  }

  async clearConfiguration(): Promise<ConfigurationResult> {
    await this.connection.ready(this.timeoutMs());
    return this.toResult(await this.admin.clearConfig());
  }

  /* ---------- discovery ---------- */

  private timeoutMs(): number {
    return Number(this.configuration.getDynamic(this.descriptor.timeoutKey) ?? DEFAULT_TIMEOUT_MS);
  }

  /** Runs on every (re)connection: check the contract, register its schema, deliver the snapshot. */
  private runDiscovery(): void {
    this.discovery = (async () => {
      const { contract, serviceName } = this.descriptor;
      const hello = this.connection.hello;
      const version = this.negotiate(hello?.contracts[contract.name] ?? []);
      const schema = await this.admin.configSchema();
      this.configuration.registerRemoteConfiguration(serviceName, schema);
      const snapshot = this.configuration.getServiceConfigSnapshot(serviceName);
      if (snapshot) {
        const applied = await this.applySnapshot(snapshot).catch((error: unknown) => {
          logger.warn(
            'RemoteService',
            `${serviceName} could not apply its stored configuration`,
            error
          );
          return null;
        });
        if (applied && !applied.success) this.logRejection(applied);
      }
      this.discovered = true;
      const status = this.connection.status;
      if (status) this.setStatus(this.toLocalStatus(status));
      logger.info(
        'RemoteService',
        `Discovered ${hello!.name} ${hello!.version} (${contract.name} v${version})`
      );
    })().catch((error: unknown) => {
      this.discovered = false;
      this.markUnavailable(error);
      throw error;
    });
    this.discovery.catch(() => undefined);
  }

  /**
   * Picks the contract major to talk: the current one when offered, else the previous one through
   * its adapter. Anything further apart is incompatible.
   */
  private negotiate(offered: string[]): string {
    const { contract, previous } = this.descriptor;
    const find = (major: number) => offered.find(version => version.startsWith(`${major}.`));
    const current = find(contract.major);
    if (current) {
      this.activeClient = this.currentClient;
      return current;
    }
    const older = previous && this.previousClient ? find(previous.contract.major) : undefined;
    if (older) {
      this.activeClient = this.previousClient!;
      logger.warn(
        'RemoteService',
        `${this.descriptor.serviceName} speaks ${contract.name} v${older}; using the v${previous!.contract.major} compatibility adapter until it is upgraded`
      );
      return older;
    }
    const supported = [contract.major, ...(previous ? [previous.contract.major] : [])];
    throw new Error(
      offered.length
        ? `Incompatible ${contract.name} contract: the service offers v${offered.join(', v')}; this backend supports v${supported.join('.x, v')}.x`
        : `Service does not provide '${contract.name}'`
    );
  }

  private async onRemoteStatus(remote: ServiceStatus): Promise<void> {
    if (!this.discovered) return;
    this.setStatus(this.toLocalStatus(remote));
    // A service process that restarted without dropping the connection (or lost its values)
    // returns to standby: deliver the backend-owned snapshot again.
    if (remote.state !== 'standby') return;
    const snapshot = this.configuration.getServiceConfigSnapshot(this.descriptor.serviceName);
    if (!snapshot) return;
    try {
      const applied = await this.applySnapshot(snapshot);
      if (!applied.success) this.logRejection(applied);
    } catch (error) {
      logger.warn(
        'RemoteService',
        `${this.descriptor.serviceName} rejected its stored configuration during standby recovery`,
        error
      );
    }
  }

  private async applySnapshot(values: Record<string, string>): Promise<ConfigurationResult> {
    return this.toResult(await this.admin.applyConfig({ values }));
  }

  private toResult(result: {
    success: boolean;
    invalidKeys?: string[];
    test?: { message: string };
  }): ConfigurationResult {
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

  private logRejection(result: ConfigurationResult): void {
    logger.warn(
      'RemoteService',
      `${this.descriptor.serviceName} rejected its stored configuration${result.invalidKeys?.length ? ` (${result.invalidKeys.join(', ')})` : ''}: ${result.message ?? 'configuration validation failed'}`
    );
  }

  private rejectionError(result: ConfigurationResult): Error {
    return new Error(result.message ?? `${this.descriptor.serviceName} rejected its configuration`);
  }

  /* ---------- status ---------- */

  private setStatus(status: ServiceInstanceStatus): void {
    const changed = JSON.stringify(this.status) !== JSON.stringify(status);
    this.status = status;
    if (changed) for (const listener of this.statusListeners) listener(status);
  }

  private markUnavailable(error: unknown): void {
    this.setStatus({
      status: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
      error: null,
    });
    logger.warn('RemoteService', `${this.descriptor.serviceName} is unavailable`, error);
  }

  private toLocalStatus(remote: ServiceStatus): ServiceInstanceStatus {
    if (remote.state === 'ready') return { status: 'ready' };
    if (remote.state === 'degraded')
      return {
        status: 'degraded',
        reason: remote.message ?? 'Degraded',
        ...(remote.missingConfiguration?.length
          ? { missingVars: remote.missingConfiguration }
          : {}),
      };
    if (remote.state === 'error')
      return {
        status: 'error',
        errorMessage: remote.message ?? remote.errorCode ?? 'Remote service error',
        error: null,
      };
    if (remote.state === 'standby' && remote.missingConfiguration?.length)
      return {
        status: 'degraded',
        reason: `Missing required configuration: ${remote.missingConfiguration.join(', ')}`,
        missingVars: remote.missingConfiguration,
      };
    return {
      status: 'initializing',
      details: remote.missingConfiguration?.length
        ? `Waiting for configuration: ${remote.missingConfiguration.join(', ')}`
        : (remote.message ?? 'Remote service is configuring'),
      startedAt: Date.now(),
    };
  }

  /** Data-plane calls fail fast with `ServiceNotConfiguredError` while the service is not ready. */
  private gatedTransport(transport: Transport): Transport {
    const serviceName = this.descriptor.serviceName;
    const notConfigured = () => new ServiceNotConfiguredError(serviceName);
    const mapError = (error: unknown): never => {
      if (
        error instanceof ContractError &&
        (error.code === 'not_configured' || error.code === 'unavailable')
      )
        throw notConfigured();
      throw error;
    };
    return {
      call: (method, input, options) => {
        const definition = this.methodDefinition(method);
        const ungated = definition?.kind === 'call' && definition.ungated;
        if (!ungated && !this.isReady()) return Promise.reject(notConfigured());
        return transport.call(method, input, options).catch(mapError);
      },
      stream: (method, input, options) => {
        if (!this.isReady()) throw notConfigured();
        return transport.stream(method, input, options);
      },
      subscribe: (method, listener, options) => transport.subscribe(method, listener, options),
      bytesPath: (method, input, ttl) => transport.bytesPath(method, input, ttl),
      bytesUrl: (method, input, ttl) => transport.bytesUrl(method, input, ttl),
      bytesOpen: (method, input, init) => transport.bytesOpen(method, input, init).catch(mapError),
      minor: (name, major) => transport.minor?.(name, major),
    };
  }

  /** The definition behind a wire name (`name@major.method`), in either supported major. */
  private methodDefinition(method: string) {
    const at = method.indexOf('@');
    const dot = method.indexOf('.', at);
    const major = Number(method.slice(at + 1, dot));
    const { contract, previous } = this.descriptor;
    const target = major === contract.major ? contract : previous?.contract;
    return target?.methods[method.slice(dot + 1)];
  }
}
