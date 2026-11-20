import {
  useGetConfigQuery,
  useGetServiceStatusesQuery,
  useSaveServiceConfigMutation,
  useTestServiceConfigMutation,
} from '@features/config/api/config.api';
import type { ConfigEntryView, ConfigServiceActionResult } from '@miauflix/backend';
import { SettingsLayout } from '@pages/settings/SettingsLayout';
import {
  ActionGroup,
  Badge,
  Button,
  Disclosure,
  List,
  ListItem,
  Message,
  Stack,
  Text,
} from '@shared/design-system';
import { FocusGroup, useNavigation } from '@shared/navigation';
import type { FC } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ServiceConfigGroup } from './components/ServiceConfigGroup';
import { useConfigForm } from './hooks/useConfigForm';
import { formatServiceName, sortServiceGroups } from './config.utils';
import * as styles from './configurationWizardPage.css';
import { serviceGroupNav } from './navIds';

import ArrowLeftIcon from '~icons/mdi/arrow-left';
import CheckIcon from '~icons/mdi/check';

const NAV = {
  stepActions: 'wizard-step-actions',
  previous: 'wizard-previous',
  next: 'wizard-next',
  optional: 'wizard-optional',
  advanced: 'wizard-advanced',
  finish: 'wizard-finish',
  finishActions: 'wizard-finish-actions',
} as const;

const optionalNavId = (name: string) => `wizard-optional:${name}`;

/** Moves virtual focus to `id` whenever `step` changes (not on the first render). */
function FocusOnStep({ step, id }: { step: string; id: string }) {
  const navigation = useNavigation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    navigation.focus(id);
    // Only a new step moves focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  return null;
}

interface Props {
  onDismiss: () => void;
}

const SERVICE_SUMMARIES: Record<string, string> = {
  CATALOG: 'Movie and show metadata from The Movie Database.',
  CATALOG_RUNTIME: 'Episode syncing and catalog freshness behavior.',
  LIST: 'Trakt lists and watchlist integration.',
  SOURCES: 'Source providers, search budgets and VPN protection.',
  MEDIA_LOAD: 'Torrent engine service: downloads, storage limits and tracker scrapes.',
  DOWNLOAD: 'Playback preparation: warmup buffer and video conversion.',
  SOURCE: 'Source discovery and ranking for available movies.',
  TMDB: 'The Movie Database provider settings.',
  VPN: 'Network routing and VPN detection.',
  JWT: 'API sessions and access token settings.',
  QUEUE: 'Background job queue connection.',
  SERVER: 'HTTP server and runtime settings.',
};

const ADVANCED_OPTIONAL_GROUPS = new Set(['CATALOG_RUNTIME', 'JWT', 'QUEUE', 'SERVER']);

function getServiceSummary(name: string, entries: ConfigEntryView[]): string {
  return SERVICE_SUMMARIES[name] ?? entries[0]?.serviceDescription ?? 'Optional service settings.';
}

function getReadiness(entries: ConfigEntryView[]): string {
  const missingRequired = entries.some(entry => entry.required && !entry.hasValue);
  if (missingRequired) return 'Needs setup';
  return 'Ready';
}

const wait = (duration: number) => new Promise(resolve => setTimeout(resolve, duration));

/** Guide required service configuration step by step, then offer optional settings before dismissal. */
export const ConfigurationWizardPage: FC<Props> = ({ onDismiss }) => {
  const { data: entries = [], isLoading } = useGetConfigQuery(undefined);
  const { data: serviceStatuses = {} } = useGetServiceStatusesQuery(undefined);
  const [testServiceConfig] = useTestServiceConfigMutation();
  const [saveServiceConfig] = useSaveServiceConfigMutation();
  const { values, dirtyServices, handleChange, getServiceEntries, markServiceSaved } =
    useConfigForm(entries);
  const [step, setStep] = useState(0);
  const [optionalService, setOptionalService] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ConfigServiceActionResult>>({});
  const [actions, setActions] = useState<Record<string, 'testing' | 'saving' | 'saved'>>({});
  const [savedServices, setSavedServices] = useState<Set<string>>(new Set());
  const [initialRequiredServiceNames, setInitialRequiredServiceNames] = useState<string[] | null>(
    null
  );

  const groups = useMemo(() => {
    const grouped: Record<string, typeof entries> = {};
    entries.forEach(entry => (grouped[entry.serviceGroup] ??= []).push(entry));
    return grouped;
  }, [entries]);
  const requiredGroupsNeedingConfiguration = useMemo(
    () =>
      sortServiceGroups(
        Object.fromEntries(
          Object.entries(groups).filter(([, group]) => {
            return group.some(entry => entry.required && !entry.hasValue);
          })
        ),
        serviceStatuses
      ),
    [groups, serviceStatuses]
  );
  useEffect(() => {
    if (!isLoading && !initialRequiredServiceNames) {
      setInitialRequiredServiceNames(requiredGroupsNeedingConfiguration.map(([name]) => name));
    }
  }, [initialRequiredServiceNames, isLoading, requiredGroupsNeedingConfiguration]);
  const requiredGroups = useMemo(() => {
    if (!initialRequiredServiceNames) return requiredGroupsNeedingConfiguration;
    return initialRequiredServiceNames
      .map(name => {
        const group = groups[name];
        return group ? ([name, group] as [string, typeof entries]) : undefined;
      })
      .filter((group): group is [string, typeof entries] => Boolean(group));
  }, [groups, initialRequiredServiceNames, requiredGroupsNeedingConfiguration]);
  const optionalGroups = useMemo(
    () =>
      sortServiceGroups(
        Object.fromEntries(
          Object.entries(groups).filter(([name, group]) => {
            const hasCompleteRequiredValues = group.every(
              entry => !entry.required || entry.hasValue
            );
            return hasCompleteRequiredValues && !initialRequiredServiceNames?.includes(name);
          })
        ),
        serviceStatuses
      ),
    [groups, initialRequiredServiceNames, serviceStatuses]
  );
  const currentRequired = requiredGroups[step];
  const currentOptional = optionalService ? groups[optionalService] : undefined;
  const current = currentOptional ?? currentRequired?.[1];
  const currentName = optionalService ?? currentRequired?.[0];
  const primaryOptionalGroups = optionalGroups.filter(
    ([name]) => !ADVANCED_OPTIONAL_GROUPS.has(name)
  );
  const advancedOptionalGroups = optionalGroups.filter(([name]) =>
    ADVANCED_OPTIONAL_GROUPS.has(name)
  );
  const renderOptionalService = ([name, group]: [string, ConfigEntryView[]]) => {
    const readiness = getReadiness(group);
    return (
      <ListItem
        key={name}
        navId={optionalNavId(name)}
        title={formatServiceName(name)}
        description={getServiceSummary(name, group)}
        metadata={
          <span className={styles.optionalMeta}>
            <Badge tone={readiness === 'Ready' ? 'success' : 'warning'}>{readiness}</Badge>
            <Text as="span" variant="caption" tone="secondary">
              {group.length} settings
            </Text>
          </span>
        }
        onClick={() => setOptionalService(name)}
      />
    );
  };

  const handleFieldChange = useCallback(
    (key: string, value: string) => {
      handleChange(key, value);
      const service = entries.find(entry => entry.key === key)?.serviceGroup;
      if (!service) return;
      setSavedServices(current => {
        const next = new Set(current);
        next.delete(service);
        return next;
      });
      setResults(current => {
        const next = { ...current };
        delete next[service];
        return next;
      });
    },
    [entries, handleChange]
  );

  const runAction = useCallback(
    async (service: string, action: 'test' | 'save') => {
      const startedAt = Date.now();
      setActions(current => ({ ...current, [service]: action === 'save' ? 'saving' : 'testing' }));
      const response =
        action === 'test'
          ? await testServiceConfig({ service, entries: getServiceEntries(service) })
          : await saveServiceConfig({ service, entries: getServiceEntries(service) });
      const responseData = 'data' in response ? response.data : undefined;
      const consumerResults = responseData?.services ?? [];
      const reactivatedServices: string[] =
        action === 'save' &&
        responseData &&
        'restarted' in responseData &&
        Array.isArray(responseData.restarted)
          ? responseData.restarted
          : [];
      const result =
        consumerResults.length > 0
          ? {
              service: service as ConfigServiceActionResult['service'],
              success: responseData?.success ?? consumerResults.every(item => item.success),
              testMode: consumerResults.some(item => item.testMode === 'validation')
                ? ('validation' as const)
                : ('live' as const),
              message: [
                ...consumerResults.map(item => `${item.service}: ${item.message}`),
                ...(reactivatedServices.length
                  ? [`Reactivated: ${reactivatedServices.join(', ')}`]
                  : []),
              ].join(' · '),
            }
          : undefined;
      if (action === 'save') await wait(Math.max(0, 500 - (Date.now() - startedAt)));
      setResults(current => ({
        ...current,
        [service]: result ?? {
          service: service as ConfigServiceActionResult['service'],
          success: false,
          testMode: 'validation',
          message: `Failed to ${action} ${service} configuration.`,
        },
      }));
      const savedSuccessfully = action === 'save' && Boolean(responseData?.success);
      if (savedSuccessfully) {
        markServiceSaved(service);
        setSavedServices(current => new Set(current).add(service));
        setActions(current => ({ ...current, [service]: 'saved' }));
        await wait(1500);
        if (!optionalService) setStep(current => current + 1);
      }
      setActions(current => {
        const next = { ...current };
        delete next[service];
        return next;
      });
    },
    [getServiceEntries, markServiceSaved, optionalService, saveServiceConfig, testServiceConfig]
  );

  if (isLoading) return <SettingsLayout title="Set up Miauflix">{null}</SettingsLayout>;

  const isOptionalStep = Boolean(optionalService);
  if (!current || !currentName) {
    const firstOptional = primaryOptionalGroups[0]?.[0];
    return (
      <SettingsLayout
        title="Optional settings"
        description="Everything required is configured. Review integrations for watching, or finish setup with the defaults already in place."
        initialNavId={NAV.finish}
      >
        <FocusOnStep
          step="optional"
          id={firstOptional ? optionalNavId(firstOptional) : NAV.finish}
        />
        <Stack gap="lg">
          <Message tone="info" title="Required settings are complete">
            You can finish setup now. Optional integrations are ready to review; open one to review
            or change it.
          </Message>
          <ActionGroup navId={NAV.finishActions}>
            <Button navId={NAV.finish} onClick={onDismiss}>
              Finish and start using Miauflix
            </Button>
            {requiredGroups.length > 0 && (
              <Button
                navId={NAV.previous}
                icon={<ArrowLeftIcon />}
                onClick={() => setStep(Math.max(0, requiredGroups.length - 1))}
              >
                Previous step
              </Button>
            )}
          </ActionGroup>
          <List navId={NAV.optional} label="Optional services">
            {primaryOptionalGroups.map(renderOptionalService)}
          </List>
          {advancedOptionalGroups.length > 0 && (
            <Disclosure
              navId={NAV.advanced}
              title={`Advanced settings (${advancedOptionalGroups.length} ${
                advancedOptionalGroups.length === 1 ? 'group' : 'groups'
              })`}
            >
              <List label="Advanced services">
                {advancedOptionalGroups.map(renderOptionalService)}
              </List>
            </Disclosure>
          )}
        </Stack>
      </SettingsLayout>
    );
  }

  const hasCompleteRequiredValues = current.every(
    entry => !entry.required || entry.hasValue || Boolean(values[entry.key]?.trim())
  );
  const canContinue =
    isOptionalStep ||
    savedServices.has(currentName) ||
    (!dirtyServices.has(currentName) && hasCompleteRequiredValues);
  const hasPreviousStep = isOptionalStep || step > 0;
  const currentResult = results[currentName];
  const nextStepHint = !canContinue
    ? hasCompleteRequiredValues && dirtyServices.has(currentName)
      ? 'Save these settings to continue.'
      : 'Complete the required settings to continue.'
    : undefined;
  const groupName = formatServiceName(currentName);
  const groupNav = serviceGroupNav(groupName);
  return (
    <SettingsLayout
      title={isOptionalStep ? groupName : 'Set up Miauflix'}
      description={
        isOptionalStep
          ? 'Review these settings, then save them or go back to the optional settings.'
          : 'Fill in the settings each service needs, then save them to continue.'
      }
      initialNavId={groupNav.group}
    >
      <FocusOnStep step={currentName} id={groupNav.group} />
      <Stack gap="lg">
        {!isOptionalStep && (
          <ol className={styles.timeline} aria-label="Required configuration steps">
            {requiredGroups.map(([name], index) => {
              const state = savedServices.has(name)
                ? 'complete'
                : index === step
                  ? 'current'
                  : 'upcoming';
              return (
                <li
                  key={name}
                  className={styles.timelineItem}
                  data-state={state}
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  <span className={styles.timelineMarker} aria-hidden="true">
                    {state === 'complete' ? <CheckIcon /> : index + 1}
                  </span>
                  <span className={styles.timelineName}>{formatServiceName(name)}</span>
                </li>
              );
            })}
            {optionalGroups.length > 0 && (
              <li className={styles.timelineItem} data-state="upcoming">
                <span className={styles.timelineMarker} aria-hidden="true">
                  {requiredGroups.length + 1}
                </span>
                <span className={styles.timelineName}>Optional services</span>
              </li>
            )}
          </ol>
        )}
        <ServiceConfigGroup
          groupName={groupName}
          entries={current}
          values={values}
          onChange={handleFieldChange}
          onTest={() => void runAction(currentName, 'test')}
          onSave={() => void runAction(currentName, 'save')}
          hasChanges={dirtyServices.has(currentName)}
          activeAction={actions[currentName]}
          result={currentResult}
          serviceStatus={serviceStatuses[currentName]}
        />
        <FocusGroup id={NAV.stepActions} layout="horizontal">
          <div className={styles.stepActions}>
            {hasPreviousStep ? (
              <Button
                navId={NAV.previous}
                icon={<ArrowLeftIcon />}
                onClick={() =>
                  isOptionalStep ? setOptionalService(null) : setStep(Math.max(0, step - 1))
                }
              >
                Previous step
              </Button>
            ) : (
              <span />
            )}
            {!isOptionalStep && (
              <Button
                navId={NAV.next}
                aria-describedby={nextStepHint ? 'next-step-hint' : undefined}
                onClick={() => setStep(step + 1)}
                disabled={!canContinue}
              >
                Next step
              </Button>
            )}
          </div>
        </FocusGroup>
        {nextStepHint && (
          <Text id="next-step-hint" variant="caption" tone="secondary" align="end">
            {nextStepHint}
          </Text>
        )}
      </Stack>
    </SettingsLayout>
  );
};

export default ConfigurationWizardPage;
