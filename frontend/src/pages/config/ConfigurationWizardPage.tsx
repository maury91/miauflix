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
import { type MessageKey, t as translate, useT } from '@shared/i18n';
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

const SERVICE_SUMMARIES: Record<string, MessageKey> = {
  CATALOG: 'config.summary.CATALOG',
  CATALOG_RUNTIME: 'config.summary.CATALOG_RUNTIME',
  LIST: 'config.summary.LIST',
  SOURCES: 'config.summary.SOURCES',
  MEDIA_LOAD: 'config.summary.MEDIA_LOAD',
  DOWNLOAD: 'config.summary.DOWNLOAD',
  SOURCE: 'config.summary.SOURCE',
  TMDB: 'config.summary.TMDB',
  VPN: 'config.summary.VPN',
  JWT: 'config.summary.JWT',
  QUEUE: 'config.summary.QUEUE',
  SERVER: 'config.summary.SERVER',
};

const ADVANCED_OPTIONAL_GROUPS = new Set(['CATALOG_RUNTIME', 'JWT', 'QUEUE', 'SERVER']);

function getServiceSummary(name: string, entries: ConfigEntryView[]): string {
  const summary = SERVICE_SUMMARIES[name];
  if (summary) return translate(summary);
  return entries[0]?.serviceDescription ?? translate('config.summary.fallback');
}

function isReady(entries: ConfigEntryView[]): boolean {
  return !entries.some(entry => entry.required && !entry.hasValue);
}

const wait = (duration: number) => new Promise(resolve => setTimeout(resolve, duration));

/** Guide required service configuration step by step, then offer optional settings before dismissal. */
export const ConfigurationWizardPage: FC<Props> = ({ onDismiss }) => {
  const t = useT();
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
    const ready = isReady(group);
    return (
      <ListItem
        key={name}
        navId={optionalNavId(name)}
        title={formatServiceName(name)}
        description={getServiceSummary(name, group)}
        metadata={
          <span className={styles.optionalMeta}>
            <Badge tone={ready ? 'success' : 'warning'}>
              {t(ready ? 'config.ready' : 'config.needsSetup')}
            </Badge>
            <Text as="span" variant="caption" tone="secondary">
              {t('config.settingCount', { count: group.length })}
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
                  ? [t('config.reactivated', { services: reactivatedServices.join(', ') })]
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
          message: t(`config.actionFailed.${action}`, { service }),
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
    [getServiceEntries, markServiceSaved, optionalService, saveServiceConfig, t, testServiceConfig]
  );

  if (isLoading)
    return (
      <SettingsLayout title={t('config.setUp')} staticLogo>
        {null}
      </SettingsLayout>
    );

  const isOptionalStep = Boolean(optionalService);
  if (!current || !currentName) {
    const firstOptional = primaryOptionalGroups[0]?.[0];
    return (
      <SettingsLayout
        staticLogo
        title={t('config.optionalTitle')}
        description={t('config.optionalDescription')}
        initialNavId={NAV.finish}
      >
        <FocusOnStep
          step="optional"
          id={firstOptional ? optionalNavId(firstOptional) : NAV.finish}
        />
        <Stack gap="lg">
          <Message tone="info" title={t('config.requiredComplete')}>
            {t('config.requiredCompleteBody')}
          </Message>
          <ActionGroup navId={NAV.finishActions}>
            <Button navId={NAV.finish} onClick={onDismiss}>
              {t('config.finish')}
            </Button>
            {requiredGroups.length > 0 && (
              <Button
                navId={NAV.previous}
                icon={<ArrowLeftIcon />}
                onClick={() => setStep(Math.max(0, requiredGroups.length - 1))}
              >
                {t('config.previousStep')}
              </Button>
            )}
          </ActionGroup>
          <List navId={NAV.optional} label={t('config.optionalServices')}>
            {primaryOptionalGroups.map(renderOptionalService)}
          </List>
          {advancedOptionalGroups.length > 0 && (
            <Disclosure
              navId={NAV.advanced}
              headingLevel={2}
              title={t('config.advancedGroups', { count: advancedOptionalGroups.length })}
            >
              <List label={t('config.advancedServices')}>
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
      ? t('config.saveToContinue')
      : t('config.completeRequired')
    : undefined;
  const groupName = formatServiceName(currentName);
  const groupNav = serviceGroupNav(groupName);
  return (
    <SettingsLayout
      staticLogo
      title={isOptionalStep ? groupName : t('config.setUp')}
      description={isOptionalStep ? t('config.reviewOptional') : t('config.fillRequired')}
      initialNavId={groupNav.group}
    >
      <FocusOnStep step={currentName} id={groupNav.group} />
      <Stack gap="lg">
        {!isOptionalStep && (
          <ol className={styles.timeline} aria-label={t('config.requiredSteps')}>
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
                <span className={styles.timelineName}>{t('config.optionalServices')}</span>
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
                {t('config.previousStep')}
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
                {t('config.nextStep')}
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
