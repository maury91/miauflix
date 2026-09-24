import { theRarbgConfigurationDefinition } from '@content-directories/therarbg/therarbg.configuration';
import { ytsConfigurationDefinition } from '@content-directories/yts/yts.configuration';
import type { VariableInfo } from '@mytypes/configuration';
import { jwtConfigurationDefinition } from '@services/auth/auth.configuration';
import { queueConfigurationDefinition } from '@services/background-job/background-job.configuration';
import { catalogConfigurationDefinition } from '@services/catalog/catalog.configuration';
import { serverConfigurationDefinition } from '@services/configuration/configuration.configuration';
import { downloadConfigurationDefinition } from '@services/download/download.configuration';
import { listConfigurationDefinition } from '@services/list/list.configuration';
import { vpnConfigurationDefinition } from '@services/security/vpn.configuration';
import { sourceConfigurationDefinition } from '@services/source/source.configuration';
import { storageConfigurationDefinition } from '@services/storage/storage.configuration';
import { objectKeys } from '@utils/object.util';

export const services = {
  JWT: jwtConfigurationDefinition,
  QUEUE: queueConfigurationDefinition,
  SERVER: serverConfigurationDefinition,
  SOURCE: sourceConfigurationDefinition,
  THE_RARBG: theRarbgConfigurationDefinition,
  CATALOG: catalogConfigurationDefinition,
  LIST: listConfigurationDefinition,
  VPN: vpnConfigurationDefinition,
  YTS: ytsConfigurationDefinition,
  DOWNLOAD: downloadConfigurationDefinition,
  STORAGE: storageConfigurationDefinition,
};

export type ConfigurationGroup = {
  name: string;
  description: string;
  variables: Record<string, VariableInfo>;
  restartable?: false;
};

/** Configuration groups are distinct from the runtime services that consume them. */
export const configurationGroups: Record<string, ConfigurationGroup> = Object.fromEntries(
  Object.entries(services).map(([key, definition]) => [key, { ...definition }])
);

const staticGroups = new Map(
  Object.entries(services).map(([key, definition]) => [key, { ...definition.variables }])
);
const remoteGroupsByService = new Map<keyof typeof services, Map<string, ConfigurationGroup>>();
const remoteVariablesByService = new Map<keyof typeof services, Set<string>>();

export const ALL_VAR_NAMES = new Set<string>(
  Object.values(services).flatMap(s => objectKeys(s.variables))
);
export const ALL_SERVICE_NAMES = new Set(objectKeys(services));
export const ALL_CONFIG_GROUP_NAMES = new Set(Object.keys(configurationGroups));

/**
 * Replaces remotely-declared variables in a service group at runtime.
 *
 * The media catalog service publishes its own configuration schema
 * (GET /configuration/schema); its variables are folded into the CATALOG group
 * here so the wizard, the admin config API and validation treat them like any
 * locally-declared variable. Group keys are stable (they exist statically), while
 * remote variables are replaced whenever the schema is rediscovered.
 */
export function replaceRemoteServiceGroups(
  serviceName: keyof typeof services,
  groups: Record<string, ConfigurationGroup>
): void {
  const next = new Map(Object.entries(groups));
  const previousGroups = remoteGroupsByService.get(serviceName) ?? new Map();
  const allDeclarations = new Map<string, VariableInfo>();
  for (const [groupName, definition] of next) {
    const base = staticGroups.get(groupName);
    const otherDefinitions = [...remoteGroupsByService.entries()]
      .filter(([owner]) => owner !== serviceName)
      .map(([, ownerGroups]) => ownerGroups.get(groupName))
      .filter((group): group is ConfigurationGroup => Boolean(group));
    const existingGroup = otherDefinitions[0];
    if (
      ((base || existingGroup) &&
        (configurationGroups[groupName].name !== definition.name ||
          configurationGroups[groupName].description !== definition.description)) ||
      (existingGroup &&
        (existingGroup.name !== definition.name ||
          existingGroup.description !== definition.description))
    ) {
      throw new Error(`Configuration group '${groupName}' has conflicting metadata`);
    }
    for (const [key, variable] of Object.entries(definition.variables)) {
      const existing =
        allDeclarations.get(key) ??
        (base as Record<string, VariableInfo> | undefined)?.[key] ??
        otherDefinitions.map(group => group.variables[key]).find(Boolean);
      if (existing && !compatibleVariableInfo(existing, variable)) {
        throw new Error(`Configuration key '${key}' has conflicting declarations`);
      }
      allDeclarations.set(key, existing ?? variable);
    }
  }

  remoteGroupsByService.set(serviceName, next);
  remoteVariablesByService.set(
    serviceName,
    new Set([...next.values()].flatMap(group => Object.keys(group.variables)))
  );

  const affected = new Set([...previousGroups.keys(), ...next.keys()]);
  for (const groupName of affected) {
    const base = staticGroups.get(groupName);
    const merged: ConfigurationGroup | undefined = base
      ? { ...services[groupName as keyof typeof services] }
      : undefined;
    const contributors = [...remoteGroupsByService.values()]
      .map(serviceGroups => serviceGroups.get(groupName))
      .filter((group): group is ConfigurationGroup => Boolean(group));
    if (!merged && contributors.length) {
      configurationGroups[groupName] = {
        name: contributors[0].name,
        description: contributors[0].description,
        variables: {},
      };
    } else if (!contributors.length && !base) {
      delete configurationGroups[groupName];
      ALL_CONFIG_GROUP_NAMES.delete(groupName);
      continue;
    }
    const target = configurationGroups[groupName];
    target.variables = { ...(base ?? {}) };
    for (const contributor of contributors) Object.assign(target.variables, contributor.variables);
    ALL_CONFIG_GROUP_NAMES.add(groupName);
  }

  const activeNames = new Set<string>(
    Object.values(configurationGroups).flatMap(group => Object.keys(group.variables))
  );
  ALL_VAR_NAMES.clear();
  for (const name of activeNames) ALL_VAR_NAMES.add(name);
}

function compatibleVariableInfo(left: VariableInfo, right: VariableInfo): boolean {
  const normalize = (value: VariableInfo) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { transform: _transform, ...metadata } = value as VariableInfo & { transform?: unknown };
    const stable = (candidate: unknown): unknown => {
      if (Array.isArray(candidate)) return candidate.map(stable);
      if (typeof candidate === 'function') return candidate.toString();
      if (candidate && typeof candidate === 'object') {
        return Object.fromEntries(
          Object.entries(candidate)
            .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
            .map(([key, nested]) => [key, stable(nested)])
        );
      }
      return candidate;
    };
    return JSON.stringify(stable(metadata));
  };
  return normalize(left) === normalize(right);
}
