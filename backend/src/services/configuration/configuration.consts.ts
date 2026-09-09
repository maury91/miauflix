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
 * Merges remotely-declared variables into a service group at runtime.
 *
 * The media catalog service publishes its own configuration schema
 * (GET /configuration/schema); its variables are folded into the CATALOG group
 * here so the wizard, the admin config API and validation treat them like any
 * locally-declared variable. Group keys are stable (they exist statically), only
 * the variables are extended.
 */
export function extendServiceVariables(
  serviceName: keyof typeof services,
  variables: Record<string, VariableInfo>
): void {
  const definition = services[serviceName];
  definition.variables = { ...definition.variables, ...variables };
  for (const key of objectKeys(variables)) {
    ALL_VAR_NAMES.add(key);
  }
}
