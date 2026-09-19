import { theRarbgConfigurationDefinition } from '@content-directories/therarbg/therarbg.configuration';
import { ytsConfigurationDefinition } from '@content-directories/yts/yts.configuration';
import type { VariableInfo } from '@mytypes/configuration';
import { jwtConfigurationDefinition } from '@services/auth/auth.configuration';
import { queueConfigurationDefinition } from '@services/background-job/background-job.configuration';
import { catalogConfigurationDefinition } from '@services/catalog/catalog.configuration';
import { serverConfigurationDefinition } from '@services/configuration/configuration.configuration';
import { traktConfigurationDefinition } from '@services/content-catalog/trakt/trakt.configuration';
import { downloadConfigurationDefinition } from '@services/download/download.configuration';
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
  TRAKT: traktConfigurationDefinition,
  VPN: vpnConfigurationDefinition,
  YTS: ytsConfigurationDefinition,
  DOWNLOAD: downloadConfigurationDefinition,
  STORAGE: storageConfigurationDefinition,
};

export const ALL_VAR_NAMES = new Set<string>(
  Object.values(services).flatMap(s => objectKeys(s.variables))
);
export const ALL_SERVICE_NAMES = new Set(objectKeys(services));

/**
 * Replaces remotely-declared variables in a service group at runtime.
 *
 * The media catalog service publishes its own configuration schema
 * (GET /configuration/schema); its variables are folded into the CATALOG group
 * here so the wizard, the admin config API and validation treat them like any
 * locally-declared variable. Group keys are stable (they exist statically), while
 * remote variables are replaced whenever the schema is rediscovered.
 */
const remoteServiceVariableNames = new Map<keyof typeof services, Set<string>>();

export function replaceServiceVariables(
  serviceName: keyof typeof services,
  variables: Record<string, VariableInfo>
): void {
  const definition = services[serviceName];
  const previousNames = remoteServiceVariableNames.get(serviceName) ?? new Set<string>();
  const nextNames = new Set(objectKeys(variables));
  const staticVariables = Object.fromEntries(
    Object.entries(definition.variables).filter(([key]) => !previousNames.has(key))
  );

  definition.variables = { ...staticVariables, ...variables } as typeof definition.variables;
  for (const key of previousNames) ALL_VAR_NAMES.delete(key);
  for (const key of nextNames) ALL_VAR_NAMES.add(key);
  remoteServiceVariableNames.set(serviceName, nextNames);
}
