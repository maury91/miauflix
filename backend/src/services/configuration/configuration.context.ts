import type { ServiceConfigSchema } from '@miauflix/contract';

import type { ConfigurableService } from '@mytypes/configuration';

import type { ConfigurationStore } from './configuration.store';
import type { ExtendedVariableInfo, ServiceName, VariableName } from './configuration.types';

/**
 * What the test/save actions need from ConfigurationService: the value store, the variable
 * registry, the live service instances, and the change notifier. Actions run under the
 * service's configuration lock; they never take it themselves.
 */
export interface ConfigurationContext {
  readonly store: ConfigurationStore;
  readonly variablesInfo: ReadonlyMap<VariableName, ExtendedVariableInfo>;
  /** Configuration group (wizard/UI section) that owns each variable. */
  readonly variableGroups: ReadonlyMap<VariableName, string>;
  readonly registeredServices: ReadonlyMap<ServiceName, ConfigurableService>;
  /** Remote services whose published schema contains the group. Empty for local groups. */
  remoteConsumersForGroup(groupName: string): ServiceName[];
  remoteSchema(serviceName: ServiceName): ServiceConfigSchema | undefined;
  getServiceConfigSnapshot(
    serviceName: ServiceName,
    overrides?: Record<string, string>
  ): Record<string, string> | undefined;
  /** Remote services whose own VPN opt-out is unset, so they follow DISABLE_VPN_CHECK. */
  vpnCheckInheritors(
    rawValues: ReadonlyMap<VariableName, string>
  ): { serviceName: ServiceName; group: string }[];
  notifyChanges(): void;
}
