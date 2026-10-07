import type { ConfigEntryView, ConfigServiceActionResult } from '@miauflix/backend';
import { SETTINGS_PALETTE } from '@shared/config/constants';
import { ActionRow, Alert, Button, LoadingIndicator } from '@shared/ui';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import styled from 'styled-components';

import { ConfigField } from './ConfigField';

import ChevronDownIcon from '~icons/line-md/chevron-down';
import ChevronRightIcon from '~icons/line-md/chevron-right';

const GroupContainer = styled.div`
  background-color: ${SETTINGS_PALETTE.background.surface};
  border: 1px solid ${SETTINGS_PALETTE.background.border};
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
`;

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${SETTINGS_PALETTE.background.border};
`;

const GroupName = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: ${SETTINGS_PALETTE.text.primary};
  margin: 0;
`;

const GroupDescription = styled.p`
  margin: 4px 0 0;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 12px;
  line-height: 1.4;
`;

const GroupTitle = styled.div`
  flex: 1;
`;

const MissingBadge = styled.span`
  font-size: 11px;
  padding: 2px 8px;
  background-color: ${SETTINGS_PALETTE.background.input};
  color: ${SETTINGS_PALETTE.color.danger};
  border-radius: 20px;
  border: 1px solid ${SETTINGS_PALETTE.color.dangerBorder};
`;

const ConfiguredBadge = styled(MissingBadge)`
  color: ${SETTINGS_PALETTE.color.success};
  border-color: rgba(66, 184, 131, 0.42);
`;

const PendingBadge = styled(MissingBadge)`
  color: ${SETTINGS_PALETTE.color.warning};
  border-color: rgba(255, 193, 7, 0.42);
`;

const DegradedBadge = styled(MissingBadge)`
  color: ${SETTINGS_PALETTE.color.warning};
  border-color: rgba(255, 193, 7, 0.42);
`;

const OptionalFields = styled.div`
  padding-top: 18px;
`;

const ConfigurationNote = styled.p`
  margin: 12px 0 0;
  color: ${SETTINGS_PALETTE.color.warning};
  font-size: 12px;
  line-height: 1.45;
`;

const ActionLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const ResultArea = styled.div`
  margin-top: 12px;
`;

const FailureTitle = styled.strong`
  display: block;
  margin-bottom: 4px;
`;

const FailureCauses = styled.ul`
  margin: 8px 0 0;
  padding-left: 18px;
`;

const RestartMessage = styled.div`
  margin-top: 8px;
  color: ${SETTINGS_PALETTE.color.warning};
  font-size: 12px;
`;

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
  const showOptionalFields = showAllOptionalFields || showOptionalSettings;
  const serviceIssue = ['degraded', 'error'].includes(serviceStatus?.status ?? '');
  const serviceIssueText =
    serviceStatus?.reason ?? serviceStatus?.errorMessage ?? serviceStatus?.details;

  useEffect(() => {
    if (hasOptionalTestFailure) setShowOptionalSettings(true);
  }, [hasOptionalTestFailure]);

  useEffect(() => {
    if (hasMissingAdvancedRequiredValue || hasAdvancedTestFailure) setShowAdvancedSettings(true);
  }, [hasAdvancedTestFailure, hasMissingAdvancedRequiredValue]);

  return (
    <GroupContainer>
      <GroupHeader>
        <GroupTitle>
          <GroupName>{groupName}</GroupName>
          {serviceDescription && <GroupDescription>{serviceDescription}</GroupDescription>}
        </GroupTitle>
        {hasMissingRequiredValues ? (
          <MissingBadge>{missingCount} missing</MissingBadge>
        ) : serviceIssue ? (
          serviceStatus?.status === 'error' ? (
            <MissingBadge>error</MissingBadge>
          ) : (
            <DegradedBadge>degraded</DegradedBadge>
          )
        ) : hasFailedTest ? (
          <MissingBadge>test failed</MissingBadge>
        ) : hasChanges ? (
          <PendingBadge>save required</PendingBadge>
        ) : result?.success && result.testMode === 'live' ? (
          <ConfiguredBadge>connection checked</ConfiguredBadge>
        ) : result?.success ? (
          <ConfiguredBadge>validated</ConfiguredBadge>
        ) : (
          <ConfiguredBadge>configured</ConfiguredBadge>
        )}
      </GroupHeader>

      {serviceIssue && serviceIssueText && (
        <ConfigurationNote role="status">
          {serviceStatus?.status === 'error' ? 'Service error: ' : 'Service degraded: '}
          {serviceIssueText}
        </ConfigurationNote>
      )}

      {requiredEntries.map(entry => (
        <ConfigField
          key={entry.key}
          entry={entry}
          value={values[entry.key] ?? ''}
          onChange={onChange}
          hasTestFailure={hasTestFailure(entry)}
        />
      ))}

      {optionalEntries.length === 1 && (
        <OptionalFields>
          <ConfigField
            entry={optionalEntries[0]}
            value={values[optionalEntries[0].key] ?? ''}
            onChange={onChange}
            hasTestFailure={hasTestFailure(optionalEntries[0])}
          />
        </OptionalFields>
      )}

      {optionalEntries.length > 1 && showAllOptionalFields && (
        <OptionalFields>
          {optionalEntries.map(entry => (
            <ConfigField
              key={entry.key}
              entry={entry}
              value={values[entry.key] ?? ''}
              onChange={onChange}
              hasTestFailure={hasTestFailure(entry)}
            />
          ))}
        </OptionalFields>
      )}

      {optionalEntries.length > 1 && !showAllOptionalFields && (
        <>
          <Button
            appearance="settings"
            size="small"
            color="secondary"
            variant="text"
            type="button"
            onClick={() => setShowOptionalSettings(isOpen => !isOpen)}
            aria-expanded={showOptionalSettings}
          >
            {showOptionalSettings ? (
              <ChevronDownIcon aria-hidden="true" />
            ) : (
              <ChevronRightIcon aria-hidden="true" />
            )}
            Optional settings ({optionalEntries.length})
          </Button>
          {showOptionalFields && (
            <OptionalFields>
              {optionalEntries.map(entry => (
                <ConfigField
                  key={entry.key}
                  entry={entry}
                  value={values[entry.key] ?? ''}
                  onChange={onChange}
                  hasTestFailure={hasTestFailure(entry)}
                />
              ))}
            </OptionalFields>
          )}
        </>
      )}

      {advancedEntries.length > 0 && (
        <>
          <Button
            appearance="settings"
            size="small"
            color="secondary"
            variant="text"
            type="button"
            onClick={() => setShowAdvancedSettings(isOpen => !isOpen)}
            aria-expanded={showAdvancedSettings}
          >
            {showAdvancedSettings ? (
              <ChevronDownIcon aria-hidden="true" />
            ) : (
              <ChevronRightIcon aria-hidden="true" />
            )}
            Advanced settings ({advancedEntries.length})
          </Button>
          {showAdvancedSettings && (
            <OptionalFields>
              {advancedEntries.map(entry => (
                <ConfigField
                  key={entry.key}
                  entry={entry}
                  value={values[entry.key] ?? ''}
                  onChange={onChange}
                  hasTestFailure={hasTestFailure(entry)}
                />
              ))}
            </OptionalFields>
          )}
        </>
      )}

      <ActionRow density="compact">
        <Button
          appearance="settings"
          size="small"
          color="secondary"
          type="button"
          onClick={onTest}
          disabled={disabled || Boolean(activeAction)}
        >
          {activeAction === 'testing' ? 'Testing...' : 'Test'}
        </Button>
        <Button
          appearance="settings"
          size="small"
          type="button"
          color="primary"
          onClick={onSave}
          disabled={disabled || Boolean(activeAction) || !hasChanges}
        >
          {activeAction === 'saving' ? (
            <ActionLabel>
              <LoadingIndicator aria-hidden="true" /> Saving
            </ActionLabel>
          ) : activeAction === 'testing' ? (
            <ActionLabel>
              <LoadingIndicator aria-hidden="true" /> Testing
            </ActionLabel>
          ) : activeAction === 'saved' ? (
            'Saved'
          ) : (
            'Save'
          )}
        </Button>
      </ActionRow>

      {hasChanges && !hasMissingRequiredValues && (
        <ConfigurationNote role="note">
          {hasSuggestedRequiredValue
            ? 'The redirect URI is suggested from this browser, but it is required and still unsaved. Save these settings to continue.'
            : hasUnsavedRequiredValues
              ? 'Required settings are filled in but not saved yet. Save these settings to continue.'
              : 'Save these settings to continue.'}
        </ConfigurationNote>
      )}

      {result && !hasMissingRequiredValues && (
        <ResultArea>
          <Alert
            severity={
              !result.success ? 'error' : result.testMode === 'validation' ? 'info' : 'success'
            }
          >
            {result.success ? (
              result.message
            ) : (
              <>
                <FailureTitle>Failed to test {groupName}</FailureTitle>
                {result.message}
                {failedTestEntries.length > 0 && (
                  <FailureCauses>
                    {failedTestEntries.map(entry => (
                      <li key={entry.key}>
                        {entry.testFailureHelp ?? `Check ${entry.key}: ${entry.description}`}
                      </li>
                    ))}
                  </FailureCauses>
                )}
              </>
            )}
          </Alert>
        </ResultArea>
      )}
      {restarted && <RestartMessage>Service reloaded with the saved configuration.</RestartMessage>}
      {needsProcessRestart && (
        <RestartMessage>A full process restart is required to apply these changes.</RestartMessage>
      )}
    </GroupContainer>
  );
};
