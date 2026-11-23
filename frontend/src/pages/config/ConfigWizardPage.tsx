import {
  useGetConfigQuery,
  useGetServiceStatusesQuery,
  useSaveServiceConfigMutation,
  useTestServiceConfigMutation,
  useUpdateConfigMutation,
} from '@features/config/api/config.api';
import type { ConfigServiceActionResult } from '@miauwatch/backend';
import { SettingsLayout } from '@pages/settings/SettingsLayout';
import { ActionGroup, Button, Message, ProgressSpinner, Stack } from '@shared/design-system';
import { useT } from '@shared/i18n';
import type { FC } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ServiceConfigGroup } from './components/ServiceConfigGroup';
import { useConfigForm } from './hooks/useConfigForm';
import {
  attributeMissingVars,
  formatServiceName,
  preserveInitialServiceOrder,
  sortServiceGroups,
} from './config.utils';
import { serviceGroupNav } from './navIds';

const NAV = {
  save: 'config-save',
  home: 'config-home',
  actions: 'config-actions',
} as const;

interface ConfigWizardPageProps {
  onDismiss: () => void;
  /** Opened before the app (a configuration gate), not from settings: the page's own static logo. */
  staticLogo?: boolean;
}

/** Edit and test service configuration while keeping the initial service-card order after saves. */
const ConfigWizardPage: FC<ConfigWizardPageProps> = ({ onDismiss, staticLogo }) => {
  const t = useT();
  const { data: configEntries = [], isLoading: isConfigLoading } = useGetConfigQuery(undefined);
  const { data: serviceStatuses = {}, isLoading: isServiceStatusesLoading } =
    useGetServiceStatusesQuery(undefined);
  const [updateConfig, { isLoading: isSaving }] = useUpdateConfigMutation();
  const [testServiceConfig] = useTestServiceConfigMutation();
  const [saveServiceConfig] = useSaveServiceConfigMutation();
  const [globalResult, setGlobalResult] = useState<{ success: boolean; message: string } | null>(
    null
  );
  const [serviceResults, setServiceResults] = useState<Record<string, ConfigServiceActionResult>>(
    {}
  );
  const [serviceActions, setServiceActions] = useState<
    Record<string, 'testing' | 'saving' | 'saved'>
  >({});
  const [serviceNotices, setServiceNotices] = useState<
    Record<string, { restarted?: boolean; needsProcessRestart?: boolean }>
  >({});
  const [initialGroupOrder, setInitialGroupOrder] = useState<string[] | null>(null);

  const {
    values,
    dirtyServices,
    handleChange,
    getSubmittableEntries,
    getServiceEntries,
    markServiceSaved,
  } = useConfigForm(configEntries);

  const groupedEntries = useMemo(() => {
    const groups: Record<string, typeof configEntries> = {};
    for (const entry of configEntries) {
      if (!groups[entry.serviceGroup]) {
        groups[entry.serviceGroup] = [];
      }
      groups[entry.serviceGroup].push(entry);
    }
    return groups;
  }, [configEntries]);

  const missingGroups = useMemo(() => {
    return Object.entries(groupedEntries)
      .filter(([, entries]) => {
        return entries.some(e => e.required && !e.hasValue);
      })
      .map(([group]) => group);
  }, [groupedEntries]);

  const initiallySortedGroups = useMemo(
    () => sortServiceGroups(groupedEntries, serviceStatuses),
    [groupedEntries, serviceStatuses]
  );

  useEffect(() => {
    if (
      initialGroupOrder === null &&
      !isConfigLoading &&
      !isServiceStatusesLoading &&
      initiallySortedGroups.length > 0
    ) {
      setInitialGroupOrder(initiallySortedGroups.map(([serviceName]) => serviceName));
    }
  }, [initialGroupOrder, initiallySortedGroups, isConfigLoading, isServiceStatusesLoading]);

  const sortedGroups = useMemo(
    () => preserveInitialServiceOrder(initiallySortedGroups, initialGroupOrder),
    [initialGroupOrder, initiallySortedGroups]
  );

  const errorMessage = (error: unknown, fallback: string) => {
    const errorData = error as { data?: string };
    return errorData.data ?? fallback;
  };

  const handleFieldChange = useCallback(
    (key: string, value: string) => {
      handleChange(key, value);
      const service = configEntries.find(entry => entry.key === key)?.serviceGroup;
      if (!service) return;
      setServiceResults(current => {
        const next = { ...current };
        delete next[service];
        return next;
      });
      setServiceNotices(current => {
        const next = { ...current };
        delete next[service];
        return next;
      });
      setServiceActions(current => {
        const next = { ...current };
        delete next[service];
        return next;
      });
      setGlobalResult(null);
    },
    [configEntries, handleChange]
  );

  const handleServiceTest = useCallback(
    async (service: string) => {
      setServiceActions(current => ({ ...current, [service]: 'testing' }));
      setServiceNotices(current => {
        const next = { ...current };
        delete next[service];
        return next;
      });
      try {
        const response = await testServiceConfig({ service, entries: getServiceEntries(service) });
        const results = 'data' in response ? (response.data?.services ?? []) : [];
        const result = results.length
          ? {
              service,
              success: response.data?.success ?? false,
              testMode: results.some(item => item.testMode === 'validation')
                ? ('validation' as const)
                : ('live' as const),
              message: results.map(item => `${item.service}: ${item.message}`).join(' · '),
            }
          : undefined;
        setServiceResults(current => ({
          ...current,
          [service]: result ?? {
            service,
            success: false,
            testMode: 'validation',
            message:
              'error' in response
                ? errorMessage(response.error, t('config.testFailed', { service }))
                : t('config.noTestResult', { service }),
          },
        }));
      } finally {
        setServiceActions(current => {
          const next = { ...current };
          delete next[service];
          return next;
        });
      }
    },
    [getServiceEntries, t, testServiceConfig]
  );

  const handleServiceSave = useCallback(
    async (service: string) => {
      setServiceActions(current => ({ ...current, [service]: 'saving' }));
      let saved = false;
      try {
        const response = await saveServiceConfig({ service, entries: getServiceEntries(service) });
        if ('error' in response) {
          setServiceResults(current => ({
            ...current,
            [service]: {
              service,
              success: false,
              testMode: 'validation',
              message: errorMessage(response.error, t('config.saveServiceFailed', { service })),
            },
          }));
          return;
        }
        if (response.data.services.length) {
          const savedResult = {
            service,
            success: response.data.success,
            testMode: response.data.services.some(item => item.testMode === 'validation')
              ? ('validation' as const)
              : ('live' as const),
            message: response.data.services
              .map(item => `${item.service}: ${item.message}`)
              .concat(
                response.data.restarted.length
                  ? [t('config.reactivated', { services: response.data.restarted.join(', ') })]
                  : []
              )
              .join(' · '),
          };
          const finalResult =
            response.data.success && !response.data.changed.includes(service)
              ? {
                  ...savedResult,
                  message: t('config.validNoChanges', { service }),
                }
              : savedResult;
          setServiceResults(current => ({ ...current, [service]: finalResult }));
        }
        setServiceNotices(current => ({
          ...current,
          [service]: {
            restarted:
              response.data.changed.includes(service) && response.data.restarted.length > 0,
            needsProcessRestart: response.data.needsProcessRestart.includes(service as never),
          },
        }));
        if (response.data.success) {
          markServiceSaved(service);
          saved = true;
          setServiceActions(current => ({ ...current, [service]: 'saved' }));
        }
      } finally {
        if (!saved) {
          setServiceActions(current => {
            const next = { ...current };
            delete next[service];
            return next;
          });
        }
      }
    },
    [getServiceEntries, markServiceSaved, saveServiceConfig, t]
  );

  const handleSave = useCallback(async () => {
    const entries = getSubmittableEntries();
    if (entries.length === 0) {
      setGlobalResult({ success: true, message: t('config.noChanges') });
      return;
    }

    const servicesBeingSaved = [...dirtyServices];
    const result = await updateConfig({ entries });

    if ('error' in result) {
      setGlobalResult({
        success: false,
        message: errorMessage(result.error, t('config.saveFailed')),
      });
    } else {
      setServiceResults(current => ({
        ...current,
        ...Object.fromEntries(result.data.services.map(item => [item.service, item])),
      }));
      setServiceNotices(current => ({
        ...current,
        ...Object.fromEntries(
          servicesBeingSaved.map(service => [
            service,
            {
              restarted: result.data.restarted.includes(service as never),
              needsProcessRestart: result.data.needsProcessRestart.includes(service as never),
            },
          ])
        ),
      }));
      setGlobalResult({
        success: result.data.success,
        message: result.data.success
          ? result.data.restarted.length
            ? t('config.savedReactivated', { services: result.data.restarted.join(', ') })
            : t('config.saved')
          : t('config.notSavedTests'),
      });
      if (result.data.success) servicesBeingSaved.forEach(service => markServiceSaved(service));
    }
  }, [dirtyServices, getSubmittableEntries, markServiceSaved, t, updateConfig]);

  const description = t('config.description');

  if (isConfigLoading) {
    return (
      <SettingsLayout
        title={t('config.title')}
        onBack={onDismiss}
        backLabel={t('common.backToHome')}
        staticLogo={staticLogo}
      >
        <ProgressSpinner label={t('config.loading')} />
      </SettingsLayout>
    );
  }

  const firstGroup = sortedGroups[0]?.[0];
  return (
    <SettingsLayout
      title={t('config.title')}
      description={description}
      onBack={onDismiss}
      backLabel={t('common.backToHome')}
      staticLogo={staticLogo}
      initialNavId={firstGroup ? serviceGroupNav(formatServiceName(firstGroup)).group : NAV.home}
    >
      <Stack gap="lg">
        {missingGroups.length > 0 && (
          <Message tone="warning" variant="banner">
            {t('config.needConfiguration', {
              services: missingGroups.map(formatServiceName).join(', '),
            })}
          </Message>
        )}

        {sortedGroups.map(([groupName, entries]) => (
          <ServiceConfigGroup
            key={groupName}
            groupName={formatServiceName(groupName)}
            entries={entries}
            values={values}
            onChange={handleFieldChange}
            onTest={() => handleServiceTest(groupName)}
            onSave={() => handleServiceSave(groupName)}
            hasChanges={dirtyServices.has(groupName)}
            activeAction={serviceActions[groupName]}
            disabled={isSaving}
            result={serviceResults[groupName]}
            restarted={serviceNotices[groupName]?.restarted}
            needsProcessRestart={serviceNotices[groupName]?.needsProcessRestart}
            serviceStatus={attributeMissingVars(
              groupName,
              serviceStatuses[groupName],
              groupedEntries
            )}
          />
        ))}

        {globalResult && (
          <Message tone={globalResult.success ? 'success' : 'danger'} live="polite">
            {globalResult.message}
          </Message>
        )}

        <ActionGroup navId={NAV.actions}>
          <Button
            navId={NAV.save}
            onClick={handleSave}
            loading={isSaving}
            disabled={
              !isSaving && (dirtyServices.size === 0 || Object.keys(serviceActions).length > 0)
            }
          >
            {t('config.saveConfiguration')}
          </Button>
          <Button navId={NAV.home} onClick={onDismiss}>
            {t('config.goHome')}
          </Button>
        </ActionGroup>
      </Stack>
    </SettingsLayout>
  );
};

export default ConfigWizardPage;
