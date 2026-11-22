import type { ConfigEntryView, ConfigServiceActionResult } from '@miauflix/backend';
import {
  ActionGroup,
  Badge,
  type BadgeProps,
  Button,
  Disclosure,
  Heading,
  Message,
  Stack,
  Surface,
  Text,
} from '@shared/design-system';
import { useT } from '@shared/i18n';
import { FocusGroup } from '@shared/navigation';
import type { FC } from 'react';
import { useEffect, useId, useState } from 'react';

import { serviceGroupNav } from '../navIds';
import { ConfigField } from './ConfigField';
import * as styles from './serviceConfigGroup.css';

interface ServiceConfigGroupProps {
  groupName: string;
  entries: ConfigEntryView[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onTest: () => void;
  onSave: () => void;
  hasChanges: boolean;
  activeAction?: 'testing' | 'saving' | 'saved';
  disabled?: boolean;
  result?: ConfigServiceActionResult;
  restarted?: boolean;
  needsProcessRestart?: boolean;
  showAllOptionalFields?: boolean;
  serviceStatus?: {
    status: string;
    reason?: string;
    errorMessage?: string;
    details?: string;
  };
}

/** Render a service’s configuration fields, test/save actions, and configuration or runtime status. */
export const ServiceConfigGroup: FC<ServiceConfigGroupProps> = ({
  groupName,
  entries,
  values,
  onChange,
  onTest,
  onSave,
  hasChanges,
  activeAction,
  disabled = false,
  result,
  restarted = false,
  needsProcessRestart = false,
  showAllOptionalFields = false,
  serviceStatus,
}) => {
  const t = useT();
  const titleId = useId();
  const nav = serviceGroupNav(groupName);
  const missingCount = entries.filter(
    entry => entry.required && !entry.hasValue && !values[entry.key]?.trim()
  ).length;
  const [showOptionalSettings, setShowOptionalSettings] = useState(false);
  const advancedEntries = entries.filter(entry => entry.advanced);
  const requiredEntries = entries.filter(entry => entry.required && !entry.advanced);
  const optionalEntries = entries.filter(entry => !entry.required && !entry.advanced);
  const serviceDescription = entries[0]?.serviceDescription;
  const hasMissingRequiredValues = missingCount > 0;
  const hasFailedTest = Boolean(result && !result.success && !hasMissingRequiredValues);
  const hasUnsavedRequiredValues = entries.some(
    entry => entry.required && !entry.hasValue && Boolean(values[entry.key]?.trim())
  );
  const hasSuggestedRequiredValue = entries.some(
    entry =>
      entry.required &&
      !entry.hasValue &&
      entry.defaultValueSource === 'browser-origin' &&
      Boolean(values[entry.key]?.trim())
  );
  const failedTestEntries = hasFailedTest ? entries.filter(entry => entry.testRelevant) : [];
  const hasTestFailure = (entry: ConfigEntryView) => Boolean(hasFailedTest && entry.testRelevant);
  const hasOptionalTestFailure = optionalEntries.some(entry => hasTestFailure(entry));
  const hasAdvancedTestFailure = advancedEntries.some(entry => hasTestFailure(entry));
  const hasMissingAdvancedRequiredValue = advancedEntries.some(
    entry => entry.required && !entry.hasValue && !values[entry.key]?.trim()
  );
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(hasMissingAdvancedRequiredValue);
  const serviceIssue = ['degraded', 'error'].includes(serviceStatus?.status ?? '');
  const serviceIssueText =
    serviceStatus?.reason ?? serviceStatus?.errorMessage ?? serviceStatus?.details;

  useEffect(() => {
    if (hasOptionalTestFailure) setShowOptionalSettings(true);
  }, [hasOptionalTestFailure]);

  useEffect(() => {
    if (hasMissingAdvancedRequiredValue || hasAdvancedTestFailure) setShowAdvancedSettings(true);
  }, [hasAdvancedTestFailure, hasMissingAdvancedRequiredValue]);

  const status: { text: string; tone: NonNullable<BadgeProps['tone']> } = hasMissingRequiredValues
    ? { text: t('config.status.missing', { count: missingCount }), tone: 'danger' }
    : serviceIssue
      ? serviceStatus?.status === 'error'
        ? { text: t('config.status.error'), tone: 'danger' }
        : { text: t('config.status.degraded'), tone: 'warning' }
      : hasFailedTest
        ? { text: t('config.status.testFailed'), tone: 'danger' }
        : hasChanges
          ? { text: t('config.status.saveRequired'), tone: 'warning' }
          : result?.success && result.testMode === 'live'
            ? { text: t('config.status.connectionChecked'), tone: 'success' }
            : result?.success
              ? { text: t('config.status.validated'), tone: 'success' }
              : { text: t('config.status.configured'), tone: 'success' };

  const fields = (list: ConfigEntryView[]) =>
    list.map(entry => (
      <ConfigField
        key={entry.key}
        entry={entry}
        value={values[entry.key] ?? ''}
        onChange={onChange}
        hasTestFailure={hasTestFailure(entry)}
      />
    ));
  const optionalInline = optionalEntries.length === 1 || showAllOptionalFields;
  const busy = Boolean(activeAction);

  return (
    <FocusGroup id={nav.group} layout="vertical">
      <Surface as="section" aria-labelledby={titleId} border radius="lg" padding="lg">
        <Stack gap="lg">
          <div>
            <div className={styles.header}>
              <Heading level={2} id={titleId} variant="heading">
                {groupName}
              </Heading>
              <span className={styles.status}>
                <Badge tone={status.tone}>{status.text}</Badge>
              </span>
            </div>
            {serviceDescription && (
              <div className={styles.description}>
                <Text tone="secondary">{serviceDescription}</Text>
              </div>
            )}
          </div>

          {serviceIssue && serviceIssueText && (
            <Message tone={serviceStatus?.status === 'error' ? 'danger' : 'warning'} live="polite">
              {t(
                serviceStatus?.status === 'error' ? 'config.serviceError' : 'config.serviceDegraded'
              )}{' '}
              {serviceIssueText}
            </Message>
          )}

          {fields(requiredEntries)}
          {optionalInline && fields(optionalEntries)}

          {!optionalInline && optionalEntries.length > 1 && (
            <Disclosure
              navId={nav.optional}
              title={t('config.optionalCount', { count: optionalEntries.length })}
              headingLevel={3}
              expanded={showOptionalSettings}
              onExpandedChange={setShowOptionalSettings}
            >
              <Stack gap="lg">{fields(optionalEntries)}</Stack>
            </Disclosure>
          )}

          {advancedEntries.length > 0 && (
            <Disclosure
              navId={nav.advanced}
              title={t('config.advancedCount', { count: advancedEntries.length })}
              headingLevel={3}
              expanded={showAdvancedSettings}
              onExpandedChange={setShowAdvancedSettings}
            >
              <Stack gap="lg">{fields(advancedEntries)}</Stack>
            </Disclosure>
          )}

          <ActionGroup navId={nav.actions} label={t('config.groupActions', { group: groupName })}>
            <Button
              navId={nav.save}
              onClick={onSave}
              loading={activeAction === 'saving'}
              disabled={
                disabled ||
                (busy ? activeAction === 'testing' || activeAction === 'saved' : !hasChanges)
              }
            >
              {activeAction === 'saving'
                ? t('common.saving')
                : activeAction === 'saved'
                  ? t('config.savedShort')
                  : t('common.save')}
            </Button>
            <Button
              navId={nav.test}
              onClick={onTest}
              loading={activeAction === 'testing'}
              disabled={disabled || (busy && activeAction !== 'testing')}
            >
              {t(activeAction === 'testing' ? 'config.testing' : 'config.test')}
            </Button>
          </ActionGroup>

          {hasChanges && !hasMissingRequiredValues && (
            <Message tone="info">
              {hasSuggestedRequiredValue
                ? t('config.suggestedRedirect')
                : hasUnsavedRequiredValues
                  ? t('config.unsavedRequired')
                  : t('config.saveToContinue')}
            </Message>
          )}

          {result && !hasMissingRequiredValues && (
            <Message
              tone={
                !result.success ? 'danger' : result.testMode === 'validation' ? 'info' : 'success'
              }
              title={result.success ? undefined : t('config.testFailedTitle', { group: groupName })}
              live={result.success ? 'polite' : 'assertive'}
            >
              {result.message}
              {failedTestEntries.length > 0 && (
                <ul className={styles.causes}>
                  {failedTestEntries.map(entry => (
                    <li key={entry.key}>
                      {entry.testFailureHelp ??
                        t('config.checkEntry', { key: entry.key, description: entry.description })}
                    </li>
                  ))}
                </ul>
              )}
            </Message>
          )}
          {restarted && <Message tone="success">{t('config.reloaded')}</Message>}
          {needsProcessRestart && <Message tone="warning">{t('config.restartRequired')}</Message>}
        </Stack>
      </Surface>
    </FocusGroup>
  );
};
