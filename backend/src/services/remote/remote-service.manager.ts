import { logger } from '@logger';
import {
  type ConfigVariable,
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
import type { ServiceInstanceStatus, VariableInfo } from '@mytypes/configuration';
import { replaceServiceVariables } from '@services/configuration/configuration.consts';
import type { ConfigurationService } from '@services/configuration/configuration.service';
import type { ServiceName } from '@services/configuration/configuration.types';
import { transforms, variable } from '@utils/config';

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
  private status: ServiceInstanceStatus = {
    status: 'initializing',
    details: 'Discovering remote service',
    startedAt: Date.now(),
  };
  private remoteKeys = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly configuration: ConfigurationService,
    private readonly descriptor: RemoteServiceDescriptor
  ) {}

  getStatus(): ServiceInstanceStatus {
    return this.status;
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
  }

  async reload(): Promise<void> {
    if (!this.manifest) await this.discover();
    await this.pushConfiguration();
    await this.refreshStatus();
  }

  /**
   * Probe the remote service with the current (possibly draft) values without
   * applying them. This is intentionally separate from reload(), which pushes
   * configuration and activates the service.
   */
  async testConfiguration(): Promise<ServiceConfigTestResult> {
    if (!this.manifest) await this.discover({ applyConfiguration: false });
    if (!this.manifest) throw new Error('Remote service has not been discovered');
    return this.request(
      serviceConfigTestResultSchema,
      this.manifest.management.configurationTestPath,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.configurationMutation()),
      }
    );
  }

  async request<T>(
    schema: ZodType<T>,
    path: string,
    options: RequestInit & { notFound?: () => T } = {}
  ): Promise<T> {
    const { notFound, ...requestOptions } = options;
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
      if (!response.ok) {
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

  private async discover(options: { applyConfiguration?: boolean } = {}): Promise<void> {
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
    const { variables, remoteKeys } = this.toVariableInfos(schema.variables);
    this.configuration.registerDynamicVariables(variables, this.descriptor.serviceName);
    replaceServiceVariables(this.descriptor.serviceName, variables);
    this.remoteKeys = remoteKeys;
    if (options.applyConfiguration ?? true) {
      try {
        await this.pushConfiguration();
      } catch (error) {
        logger.debug(
          'RemoteService',
          `${this.descriptor.serviceName} configuration is not ready yet`,
          error
        );
      }
    }
    await this.refreshStatus();
    logger.info(
      'RemoteService',
      `Discovered ${manifest.name} ${manifest.version} (${this.descriptor.capability} v${capability.version})`
    );
  }

  private async refreshStatus(): Promise<void> {
    if (!this.manifest) return;
    const remote = await this.request(serviceStatusSchema, this.manifest.management.statusPath);
    this.status = this.toLocalStatus(remote);
  }

  private async pushConfiguration(): Promise<void> {
    if (!this.manifest) throw new Error('Remote service has not been discovered');
    const result = await this.request(
      serviceConfigApplyResultSchema,
      this.manifest.management.configurationApplyPath,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.configurationMutation()),
      }
    );
    if (!result.success) {
      throw new Error(
        result.test?.message ?? `Rejected keys: ${(result.invalidKeys ?? []).join(', ')}`
      );
    }
  }

  private configurationMutation(): { values: Record<string, string>; unsetKeys: string[] } {
    const values: Record<string, string> = {};
    const unsetKeys: string[] = [];
    for (const [localKey, remoteKey] of this.remoteKeys) {
      const value = this.configuration.getDynamic(localKey);
      if (value === undefined || value === null || value === '') unsetKeys.push(remoteKey);
      else values[remoteKey] = String(value);
    }
    return { values, unsetKeys };
  }

  private toVariableInfos(entries: ConfigVariable[]): {
    variables: Record<string, VariableInfo>;
    remoteKeys: Map<string, string>;
  } {
    const result: Record<string, VariableInfo> = {};
    const remoteKeys = new Map<string, string>();
    for (const entry of entries) {
      const localKey = `${this.descriptor.serviceName}__${entry.key}`;
      remoteKeys.set(localKey, entry.key);
      result[localKey] = this.toVariableInfo(entry);
    }
    return { variables: result, remoteKeys };
  }

  private toVariableInfo(entry: ConfigVariable): VariableInfo {
    const common = {
      description: entry.description,
      required: entry.required,
      example: entry.example,
      link: entry.link,
      linkLabel: entry.linkLabel,
      testRelevant: entry.testRelevant,
      testFailureHelp: entry.testFailureHelp,
      booleanStateDescriptions: entry.booleanStateDescriptions,
    };
    switch (entry.inputType) {
      case 'password':
        return variable({ ...common, password: true });
      case 'select':
        return variable({
          ...common,
          defaultValue: entry.defaultValue,
          options: entry.options ?? {},
          transform: transforms.enum({ values: Object.keys(entry.options ?? {}) } as never),
        });
      case 'boolean':
        return variable({
          ...common,
          defaultValue: entry.defaultValue,
          transform: transforms.boolean(),
        });
      case 'number':
        return variable({
          ...common,
          defaultValue: entry.defaultValue,
          transform: transforms.number(entry.numberOptions ?? {}),
        });
      default:
        return variable({
          ...common,
          defaultValue: entry.defaultValue,
          transform: transforms.string(),
        });
    }
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
    this.status = {
      status: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
      error: null,
    };
    logger.warn('RemoteService', `${this.descriptor.serviceName} discovery/status failed`, error);
  }
}
