import type { ConfigEntryView, ConfigServiceActionResult } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import type { FC } from 'react';
import { useState } from 'react';
import styled from 'styled-components';

import { ConfigField } from './ConfigField';

const GroupContainer = styled.div`
  background-color: #0c1214;
  border: 1px solid #191e23;
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
  border-bottom: 1px solid #191e23;
`;

const GroupName = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  margin: 0;
`;

const GroupDescription = styled.p`
  margin: 4px 0 0;
  color: #888;
  font-size: 12px;
  line-height: 1.4;
`;

const GroupTitle = styled.div`
  flex: 1;
`;

const MissingBadge = styled.span`
  font-size: 11px;
  padding: 2px 8px;
  background-color: ${PALETTE.color.dangerSubtle};
  color: ${PALETTE.color.danger};
  border-radius: 4px;
  border: 1px solid ${PALETTE.color.dangerBorder};
`;

const OptionalSettingsButton = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 0 0;
  margin-top: 4px;
  border: 0;
  border-top: 1px solid #191e23;
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
  border-top: 1px solid #191e23;
`;

const ActionButton = styled.button<{ $primary?: boolean }>`
  padding: 8px 18px;
  border: 1px solid ${props => (props.$primary ? PALETTE.color.brand : '#555')};
  border-radius: 4px;
  background: ${props => (props.$primary ? PALETTE.color.brand : 'transparent')};
  color: #eee;
  font:
    500 13px 'Poppins',
    sans-serif;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${props =>
      props.$primary ? PALETTE.color.brandHover : PALETTE.color.interactive};
    background: ${props =>
      props.$primary ? PALETTE.color.brandHover : PALETTE.color.interactiveSubtle};
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
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
          : 'rgba(76, 175, 80, 0.45)'
        : PALETTE.color.dangerBorder};
  background: ${props =>
    props.$success
      ? props.$validationOnly
        ? 'rgba(214, 219, 224, 0.08)'
        : 'rgba(76, 175, 80, 0.1)'
      : PALETTE.color.dangerSubtle};
  color: ${props =>
    props.$success ? (props.$validationOnly ? '#ddd' : '#81c784') : PALETTE.color.danger};
  font-size: 12px;
`;

const RestartMessage = styled.div`
  margin-top: 8px;
  color: ${PALETTE.color.warning};
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
  activeAction?: 'test' | 'save';
  disabled?: boolean;
  result?: ConfigServiceActionResult;
  restarted?: boolean;
  needsProcessRestart?: boolean;
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
}) => {
  const missingCount = entries.filter(e => e.required && !e.hasValue).length;
  const [showOptionalSettings, setShowOptionalSettings] = useState(false);
  const requiredEntries = entries.filter(entry => entry.required);
  const optionalEntries = entries.filter(entry => !entry.required);
  const serviceDescription = entries[0]?.serviceDescription;

  return (
    <GroupContainer>
      <GroupHeader>
        <GroupTitle>
          <GroupName>{groupName}</GroupName>
          {serviceDescription && <GroupDescription>{serviceDescription}</GroupDescription>}
        </GroupTitle>
        {missingCount > 0 && <MissingBadge>{missingCount} missing</MissingBadge>}
      </GroupHeader>

      {requiredEntries.map(entry => (
        <ConfigField
          key={entry.key}
          entry={entry}
          value={values[entry.key] ?? ''}
          onChange={onChange}
        />
      ))}

      {optionalEntries.length > 0 && (
        <>
          <OptionalSettingsButton
            type="button"
            onClick={() => setShowOptionalSettings(isOpen => !isOpen)}
            aria-expanded={showOptionalSettings}
          >
            Optional settings ({optionalEntries.length})
            <span aria-hidden="true">{showOptionalSettings ? '−' : '+'}</span>
          </OptionalSettingsButton>
          {showOptionalSettings && (
            <OptionalFields>
              {optionalEntries.map(entry => (
                <ConfigField
                  key={entry.key}
                  entry={entry}
                  value={values[entry.key] ?? ''}
                  onChange={onChange}
                />
              ))}
            </OptionalFields>
          )}
        </>
      )}

      <Actions>
        <ActionButton type="button" onClick={onTest} disabled={disabled || Boolean(activeAction)}>
          {activeAction === 'test' ? 'Testing...' : 'Test'}
        </ActionButton>
        <ActionButton
          type="button"
          $primary
          onClick={onSave}
          disabled={disabled || Boolean(activeAction) || !hasChanges}
        >
          {activeAction === 'save' ? 'Saving...' : 'Save'}
        </ActionButton>
      </Actions>

      {result && (
        <ResultMessage
          $success={result.success}
          $validationOnly={result.success && result.testMode === 'validation'}
        >
          {result.message}
        </ResultMessage>
      )}
      {restarted && <RestartMessage>Service reloaded with the saved configuration.</RestartMessage>}
      {needsProcessRestart && (
        <RestartMessage>A full process restart is required to apply these changes.</RestartMessage>
      )}
    </GroupContainer>
  );
};
