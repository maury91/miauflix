import { useListSessionsQuery } from '@features/auth/api/auth.api';
import {
  type ServiceStatuses,
  useGetConfigQuery,
  useGetServiceStatusesQuery,
} from '@features/config/api/config.api';
import { useCheckSetupStatusQuery } from '@features/setup/api/setup.api';
import type { ConfigEntryView } from '@miauflix/backend';
import { useAppSelector } from '@store';
import { selectConfigDismissed, selectSetupAvailable } from '@store/slices/appState';
import { selectIsAdmin, selectIsAuthenticated } from '@store/slices/auth';

export type AppState = 'loading' | 'initial_setup' | 'login' | 'config' | 'config_wizard' | 'home';

/**
 * Report missing required values or a service explicitly needing configuration.
 * Degraded/error status alone and absent data do not require configuration.
 */
export function hasConfigurationIssue(
  configEntries: ConfigEntryView[] | undefined,
  serviceStatuses: ServiceStatuses | undefined
): boolean {
  const hasMissingRequiredValue = configEntries?.some(entry => entry.required && !entry.hasValue);
  const hasMisconfiguredService = Object.values(serviceStatuses ?? {}).some(
    ({ status, missingVars }) => status === 'needs_configuration' || (missingVars?.length ?? 0) > 0
  );

  return hasMissingRequiredValue === true || hasMisconfiguredService;
}

export function getConfigurationPageState(
  configEntries: ConfigEntryView[] | undefined,
  serviceStatuses: ServiceStatuses | undefined,
  configDismissed: boolean
): 'config' | 'config_wizard' | null {
  // LIST (Trakt) enriches browsing but is not required to use the catalog.
  const isEssential = (group: string) =>
    group !== 'LIST' && group !== 'TRAKT' && group !== 'SUBTITLES';
  const hasMissingRequiredConfig =
    configEntries?.some(
      entry => entry.required && !entry.hasValue && isEssential(entry.serviceGroup)
    ) === true;
  const hasMissingEssentialService = Object.entries(serviceStatuses ?? {}).some(
    ([group, service]) =>
      isEssential(group) &&
      (service.status === 'needs_configuration' || (service.missingVars?.length ?? 0) > 0)
  );
  if (hasMissingRequiredConfig || hasMissingEssentialService) return 'config_wizard';
  if (!configDismissed && hasConfigurationIssue(configEntries, serviceStatuses)) return 'config';
  return null;
}

export function resolveAppState(input: {
  setupCheckLoading: boolean;
  sessionsLoading: boolean;
  setupAvailable: boolean | null;
  authenticated: boolean;
  admin: boolean;
  configLoading: boolean;
  serviceStatusesLoading: boolean;
  configEntries: ConfigEntryView[] | undefined;
  serviceStatuses: ServiceStatuses | undefined;
  configDismissed: boolean;
}): AppState {
  const {
    setupCheckLoading,
    sessionsLoading,
    setupAvailable,
    authenticated,
    admin,
    configLoading,
    serviceStatusesLoading,
    configEntries,
    serviceStatuses,
    configDismissed,
  } = input;

  if (setupCheckLoading || sessionsLoading) return 'loading';
  if (setupAvailable === true) return 'initial_setup';
  if (!authenticated) return 'login';
  if (!admin) return 'home';
  if (configLoading || serviceStatusesLoading) return 'loading';
  return getConfigurationPageState(configEntries, serviceStatuses, configDismissed) ?? 'home';
}

export function useAppState(): AppState {
  const configDismissed = useAppSelector(selectConfigDismissed);
  const setupAvailable = useAppSelector(selectSetupAvailable);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const isAdmin = useAppSelector(selectIsAdmin);

  // These queries are already initiated at store init; here we just read their loading state
  const { isLoading: isSetupCheckLoading } = useCheckSetupStatusQuery(undefined);
  const { isLoading: isSessionsLoading } = useListSessionsQuery(undefined);

  // Only fetch config when authenticated as admin
  const { data: configData, isLoading: isConfigLoading } = useGetConfigQuery(undefined, {
    skip: !isAuthenticated || !isAdmin,
  });
  const { data: serviceStatuses, isLoading: isServiceStatusesLoading } = useGetServiceStatusesQuery(
    undefined,
    { skip: !isAuthenticated || !isAdmin }
  );

  return resolveAppState({
    setupCheckLoading: isSetupCheckLoading,
    sessionsLoading: isSessionsLoading,
    setupAvailable,
    authenticated: isAuthenticated,
    admin: isAdmin,
    configLoading: isConfigLoading,
    serviceStatusesLoading: isServiceStatusesLoading,
    configEntries: configData,
    serviceStatuses,
    configDismissed,
  });
}
