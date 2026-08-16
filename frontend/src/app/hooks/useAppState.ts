import { useListSessionsQuery } from '@features/auth/api/auth.api';
import { useGetConfigQuery } from '@features/config/api/config.api';
import { useCheckSetupStatusQuery } from '@features/setup/api/setup.api';
import { useAppSelector } from '@store';
import { selectConfigDismissed, selectSetupAvailable } from '@store/slices/appState';
import { selectIsAdmin, selectIsAuthenticated } from '@store/slices/auth';

export type AppState = 'loading' | 'initial_setup' | 'login' | 'config' | 'home';

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

  // 5. Config is still loading → show home in the meantime (non-blocking)
  if (isConfigLoading) {
    return 'home';
  }

  // 6. Admin with missing required config vars → show config wizard
  const hasMissingConfig = configData?.some(e => e.required && !e.hasValue) ?? false;
  if (hasMissingConfig && !configDismissed) {
    return 'config';
  }

  // 7. Default: home
  return 'home';
}
