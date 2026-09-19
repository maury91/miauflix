import type { ConfigEntryView, ConfigServiceActionResult } from '@miauflix/backend';
import { SETTINGS_PALETTE } from '@shared/config/constants';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import styled from 'styled-components';

import { ConfigField } from './ConfigField';

import ChevronDownIcon from '~icons/line-md/chevron-down';
import ChevronRightIcon from '~icons/line-md/chevron-right';
import LoadingIcon from '~icons/line-md/loading-twotone-loop';

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

const OptionalSettingsButton = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 11px 0 0;
  border: 0;
  background: transparent;
  color: #aaa;
  font:
    500 13px 'Poppins',
    sans-serif;
  cursor: pointer;

  &:hover {
    color: #fff;
  }
`;

const OptionalFields = styled.div`
  padding-top: 18px;
`;

const Actions = styled.div`
  display: flex;
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid ${SETTINGS_PALETTE.background.border};
`;

const ActionButton = styled.button<{ $primary?: boolean }>`
  padding: 8px 18px;
  border: 1px solid
    ${props =>
      props.$primary ? SETTINGS_PALETTE.color.primaryButton : SETTINGS_PALETTE.background.border};
  border-radius: 4px;
  background: ${props => (props.$primary ? SETTINGS_PALETTE.color.primaryButton : 'transparent')};
  color: ${props => (props.$primary ? '#0a0d0f' : SETTINGS_PALETTE.text.primary)};
  font:
    500 13px 'Poppins',
    sans-serif;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${props =>
      props.$primary
        ? SETTINGS_PALETTE.color.primaryButtonHover
        : SETTINGS_PALETTE.color.interactive};
    background: ${props =>
      props.$primary
        ? SETTINGS_PALETTE.color.primaryButtonHover
        : SETTINGS_PALETTE.color.interactiveSubtle};
  }

  &:active:not(:disabled) {
    background: ${props =>
      props.$primary
        ? SETTINGS_PALETTE.color.primaryButtonPressed
        : SETTINGS_PALETTE.color.interactive};
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const ActionLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const ButtonSpinner = styled(LoadingIcon)`
  width: 16px;
  height: 16px;
`;

const ResultMessage = styled.div<{ $success: boolean; $validationOnly: boolean }>`
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid
    ${props =>
      props.$success
        ? props.$validationOnly
          ? '#666'
          : 'rgba(66, 184, 131, 0.45)'
        : SETTINGS_PALETTE.color.dangerBorder};
  background: ${props =>
    props.$success
      ? props.$validationOnly
        ? 'rgba(233, 236, 238, 0.08)'
        : 'rgba(66, 184, 131, 0.1)'
      : SETTINGS_PALETTE.color.dangerSubtle};
  color: ${props =>
    props.$success
      ? props.$validationOnly
        ? SETTINGS_PALETTE.text.primary
        : SETTINGS_PALETTE.color.success
      : SETTINGS_PALETTE.color.danger};
  font-size: 12px;
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
}

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
  const failedTestEntries = hasFailedTest ? entries.filter(entry => entry.testRelevant) : [];
  const hasTestFailure = (entry: ConfigEntryView) => Boolean(hasFailedTest && entry.testRelevant);
  const hasOptionalTestFailure = optionalEntries.some(entry => hasTestFailure(entry));
  const hasAdvancedTestFailure = advancedEntries.some(entry => hasTestFailure(entry));
  const hasMissingAdvancedRequiredValue = advancedEntries.some(
    entry => entry.required && !entry.hasValue && !values[entry.key]?.trim()
  );
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(hasMissingAdvancedRequiredValue);
  const showOptionalFields = showAllOptionalFields || showOptionalSettings;

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
        ) : hasFailedTest ? (
          <MissingBadge>test failed</MissingBadge>
        ) : (
          <ConfiguredBadge>configured</ConfiguredBadge>
        )}
      </GroupHeader>

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
          <OptionalSettingsButton
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
          </OptionalSettingsButton>
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
          <OptionalSettingsButton
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
          </OptionalSettingsButton>
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

      <Actions>
        <ActionButton type="button" onClick={onTest} disabled={disabled || Boolean(activeAction)}>
          {activeAction === 'testing' ? 'Testing...' : 'Test'}
        </ActionButton>
        <ActionButton
          type="button"
          $primary
          onClick={onSave}
          disabled={disabled || Boolean(activeAction) || !hasChanges}
        >
          {activeAction === 'saving' ? (
            <ActionLabel>
              <ButtonSpinner aria-hidden="true" /> Saving
            </ActionLabel>
          ) : activeAction === 'testing' ? (
            <ActionLabel>
              <ButtonSpinner aria-hidden="true" /> Testing
            </ActionLabel>
          ) : activeAction === 'saved' ? (
            'Saved'
          ) : (
            'Save'
          )}
        </ActionButton>
      </Actions>

      {result && !hasMissingRequiredValues && (
        <ResultMessage
          $success={result.success}
          $validationOnly={result.success && result.testMode === 'validation'}
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
        </ResultMessage>
      )}
      {restarted && <RestartMessage>Service reloaded with the saved configuration.</RestartMessage>}
      {needsProcessRestart && (
        <RestartMessage>A full process restart is required to apply these changes.</RestartMessage>
      )}
    </GroupContainer>
  );
};
