import {
  useGetConfigQuery,
  useSaveServiceConfigMutation,
  useTestServiceConfigMutation,
} from '@features/config/api/config.api';
import type { ConfigServiceActionResult } from '@miauflix/backend';
import { SETTINGS_PALETTE } from '@shared/config/constants';
import type { FC } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

import { ServiceConfigGroup } from './components/ServiceConfigGroup';
import { useConfigForm } from './hooks/useConfigForm';
import { sortServiceGroups } from './config.utils';

import ChevronLeftIcon from '~icons/line-md/chevron-left';
import ChevronRightIcon from '~icons/line-md/chevron-right';

const Page = styled.div`
  position: fixed;
  inset: 0;
  overflow-y: auto;
  z-index: 1000;
  background: ${SETTINGS_PALETTE.background.primary};
  color: ${SETTINGS_PALETTE.text.primary};
  font-family: 'Poppins', sans-serif;
`;

const Content = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 132px 24px 40px;
`;

const Title = styled.h1`
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 400;
`;

const Subtitle = styled.p`
  margin: 0 0 28px;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 14px;
`;

const Timeline = styled.ol`
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  margin: 0 0 28px;
  padding: 0;
  list-style: none;
`;

const TimelineItem = styled.li<{ $state: 'complete' | 'current' | 'optional' | 'upcoming' }>`
  position: relative;
  display: grid;
  justify-items: center;
  flex: 1 1 100px;
  min-width: 0;
  color: ${props =>
    props.$state === 'complete'
      ? SETTINGS_PALETTE.color.primaryButton
      : props.$state === 'current'
        ? SETTINGS_PALETTE.color.interactive
        : props.$state === 'optional'
          ? SETTINGS_PALETTE.text.optional
          : SETTINGS_PALETTE.text.secondary};
  font-size: 12px;

  &:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 9px;
    left: calc(50% + 9px);
    width: 100%;
    height: 1px;
    background: ${props =>
      props.$state === 'complete'
        ? SETTINGS_PALETTE.color.primaryButton
        : SETTINGS_PALETTE.background.border};
  }
`;

const OptionalServicesGroup = styled.li`
  display: grid;
  justify-items: center;
  flex: 1 1 100px;
  min-width: 0;
  color: ${SETTINGS_PALETTE.text.optional};
  font-size: 12px;
`;

const TimelineDot = styled.span<{ $state: 'complete' | 'current' | 'optional' | 'upcoming' }>`
  position: relative;
  z-index: 1;
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border: 1px solid
    ${props =>
      props.$state === 'complete'
        ? SETTINGS_PALETTE.color.primaryButton
        : props.$state === 'current'
          ? SETTINGS_PALETTE.color.interactive
          : props.$state === 'optional'
            ? SETTINGS_PALETTE.text.optional
            : SETTINGS_PALETTE.background.border};
  border-radius: 50%;
  background: ${props =>
    props.$state === 'complete'
      ? SETTINGS_PALETTE.color.primaryButton
      : props.$state === 'current'
        ? SETTINGS_PALETTE.color.interactive
        : props.$state === 'optional'
          ? SETTINGS_PALETTE.text.optional
          : SETTINGS_PALETTE.background.surface};
  color: ${props => (props.$state === 'upcoming' ? SETTINGS_PALETTE.text.secondary : '#0a0d0f')};
  font-size: 11px;
`;

const TimelineName = styled.span`
  display: block;
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  white-space: nowrap;
`;

const Navigation = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 24px;
`;

const ServiceStep = styled.div`
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 42px;
  align-items: center;
  gap: 16px;

  @media (max-width: 720px) {
    grid-template-columns: 32px minmax(0, 1fr) 32px;
    gap: 8px;
  }
`;

const Button = styled.button<{ $primary?: boolean }>`
  padding: 10px 20px;
  border: 1px solid
    ${props =>
      props.$primary ? SETTINGS_PALETTE.color.primaryButton : SETTINGS_PALETTE.background.border};
  border-radius: 4px;
  background: ${props => (props.$primary ? SETTINGS_PALETTE.color.primaryButton : 'transparent')};
  color: ${props => (props.$primary ? '#0a0d0f' : SETTINGS_PALETTE.text.primary)};
  cursor: pointer;
  font:
    500 14px 'Poppins',
    sans-serif;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const ChevronButton = styled.button`
  display: inline-grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid ${SETTINGS_PALETTE.background.border};
  border-radius: 50%;
  background: ${SETTINGS_PALETTE.background.surface};
  color: ${SETTINGS_PALETTE.text.primary};
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${SETTINGS_PALETTE.color.interactive};
    color: ${SETTINGS_PALETTE.color.interactive};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const OptionalList = styled.div`
  display: grid;
  gap: 12px;
`;

const OptionalService = styled.button`
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 16px;
  border: 1px solid ${SETTINGS_PALETTE.background.border};
  border-radius: 8px;
  background: ${SETTINGS_PALETTE.background.surface};
  color: ${SETTINGS_PALETTE.text.primary};
  cursor: pointer;
  text-align: left;

  &:hover {
    border-color: ${SETTINGS_PALETTE.color.interactive};
  }
`;

interface Props {
  onDismiss: () => void;
}

const formatServiceName = (name: string) =>
  name === name.toUpperCase() && name.length > 4
    ? name
        .toLowerCase()
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : name;

const wait = (duration: number) => new Promise(resolve => setTimeout(resolve, duration));

export const ConfigurationWizardPage: FC<Props> = ({ onDismiss }) => {
  const { data: entries = [], isLoading } = useGetConfigQuery(undefined);
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
        )
      ),
    [groups]
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
        )
      ),
    [groups, initialRequiredServiceNames]
  );
  const currentRequired = requiredGroups[step];
  const currentOptional = optionalService ? groups[optionalService] : undefined;
  const current = currentOptional ?? currentRequired?.[1];
  const currentName = optionalService ?? currentRequired?.[0];

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

  if (isLoading) return <Page />;

  const isOptionalStep = Boolean(optionalService);
  if (!current || !currentName) {
    return (
      <Page>
        <Content>
          <Title>Optional settings</Title>
          <Subtitle>
            Everything required is configured. Add any optional integrations now, or finish setup.
          </Subtitle>
          <OptionalList>
            {optionalGroups.map(([name, group]) => (
              <OptionalService key={name} type="button" onClick={() => setOptionalService(name)}>
                <span>{formatServiceName(name)}</span>
                <span>{group.filter(entry => !entry.required).length} settings</span>
              </OptionalService>
            ))}
          </OptionalList>
          <Navigation>
            <ChevronButton
              type="button"
              aria-label="Previous step"
              onClick={() => setStep(Math.max(0, requiredGroups.length - 1))}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </ChevronButton>
            <Button type="button" $primary onClick={onDismiss}>
              Finish and start using Miauflix
            </Button>
          </Navigation>
        </Content>
      </Page>
    );
  }

  const hasCompleteRequiredValues = current.every(entry => !entry.required || entry.hasValue);
  const canContinue =
    isOptionalStep ||
    savedServices.has(currentName) ||
    (!dirtyServices.has(currentName) && hasCompleteRequiredValues);
  const hasPreviousStep = isOptionalStep || step > 0;
  const currentResult = results[currentName];
  return (
    <Page>
      <Content>
        {!isOptionalStep && (
          <Timeline aria-label="Required configuration steps">
            {requiredGroups.map(([name], index) => {
              const state = savedServices.has(name)
                ? 'complete'
                : index === step
                  ? 'current'
                  : 'upcoming';
              return (
                <TimelineItem key={name} $state={state}>
                  <TimelineDot $state={state}>{index + 1}</TimelineDot>
                  <TimelineName>{formatServiceName(name)}</TimelineName>
                </TimelineItem>
              );
            })}
            {optionalGroups.length > 0 && (
              <OptionalServicesGroup>
                <TimelineDot $state="optional">{requiredGroups.length + 1}</TimelineDot>
                <TimelineName>Optional services</TimelineName>
              </OptionalServicesGroup>
            )}
          </Timeline>
        )}
        <ServiceStep>
          <div>
            {hasPreviousStep && (
              <ChevronButton
                type="button"
                aria-label="Previous step"
                onClick={() =>
                  isOptionalStep ? setOptionalService(null) : setStep(Math.max(0, step - 1))
                }
              >
                <ChevronLeftIcon aria-hidden="true" />
              </ChevronButton>
            )}
          </div>
          <ServiceConfigGroup
            groupName={formatServiceName(currentName)}
            entries={current}
            values={values}
            onChange={handleFieldChange}
            onTest={() => void runAction(currentName, 'test')}
            onSave={() => void runAction(currentName, 'save')}
            hasChanges={dirtyServices.has(currentName)}
            activeAction={actions[currentName]}
            result={currentResult}
          />
          {!isOptionalStep && (
            <div>
              <ChevronButton
                type="button"
                aria-label="Next step"
                onClick={() => setStep(step + 1)}
                disabled={!canContinue}
              >
                <ChevronRightIcon aria-hidden="true" />
              </ChevronButton>
            </div>
          )}
        </ServiceStep>
      </Content>
    </Page>
  );
};

export default ConfigurationWizardPage;
