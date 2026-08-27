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

export type AppState = 'loading' | 'initial_setup' | 'login' | 'config' | 'home';

export function hasConfigurationIssue(
  configEntries: ConfigEntryView[] | undefined,
  serviceStatuses: ServiceStatuses | undefined
): boolean {
  const hasMissingRequiredValue = configEntries?.some(entry => entry.required && !entry.hasValue);
  const hasMisconfiguredService = Object.values(serviceStatuses ?? {}).some(({ status }) =>
    ['needs_configuration', 'degraded', 'error'].includes(status)
  );

  return hasMissingRequiredValue === true || hasMisconfiguredService;
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

  // 1. Still loading initial checks
  if (isSetupCheckLoading || isSessionsLoading) {
    return 'loading';
  }

  // 2. Initial setup mode (ALLOW_CREATE_ADMIN_ON_FIRST_RUN=true, no admin yet)
  if (setupAvailable === true) {
    return 'initial_setup';
  }

  // 3. Not authenticated → show login
  if (!isAuthenticated) {
    return 'login';
  }

  // 4. Authenticated but not admin → go home (non-admin users don't see config wizard)
  if (!isAdmin) {
    return 'home';
  }

  // 5. Wait for the admin configuration check before selecting a destination.
  // This prevents a newly logged-in admin from landing on Home before being
  // redirected to the configuration wizard when required values are missing.
  if (isConfigLoading || isServiceStatusesLoading) {
    return 'loading';
  }

  // 6. The setup flag only governs first-admin registration. The wizard is
  // exclusively driven by missing configuration or a degraded/error service.
  if (hasConfigurationIssue(configData, serviceStatuses) && !configDismissed) {
    return 'config';
  }

  // 7. Default: home
  return 'home';
}
