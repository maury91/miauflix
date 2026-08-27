import type { ConfigEntryView } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import type { FC } from 'react';
import styled from 'styled-components';

const FieldWrapper = styled.div<{ $hasError?: boolean }>`
  margin-bottom: 20px;
`;

const FieldHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
`;

const FieldKey = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: #cccccc;
  font-family: 'Courier New', monospace;
`;

const RequiredBadge = styled.span`
  font-size: 10px;
  font-weight: 600;
  color: ${PALETTE.color.danger};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const AlreadyConfiguredBadge = styled.span`
  font-size: 10px;
  color: #4caf50;
  display: flex;
  align-items: center;
  gap: 4px;
`;

const FieldDescription = styled.p`
  font-size: 12px;
  color: #888;
  margin: 0 0 6px 0;
  line-height: 1.4;
`;

const FieldLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: ${PALETTE.color.link};
  text-decoration: none;
  margin-bottom: 6px;

  &:hover {
    text-decoration: underline;
  }
`;

const FieldExample = styled.p`
  font-size: 11px;
  color: #666;
  margin: 0 0 6px 0;
  font-family: 'Courier New', monospace;
`;

const FieldInput = styled.input<{ $missing?: boolean }>`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid ${props => (props.$missing ? PALETTE.color.danger : '#444')};
  border-radius: 4px;
  background-color: #1a1d20;
  color: white;
  font-size: 13px;
  font-family: 'Poppins', sans-serif;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: ${props => (props.$missing ? PALETTE.color.danger : PALETTE.color.interactive)};
    box-shadow: 0 0 0 3px
      ${props => (props.$missing ? PALETTE.color.dangerSubtle : PALETTE.color.interactiveSubtle)};
  }

  &::placeholder {
    color: #555;
  }
`;

const FieldSelect = styled.select`
  padding: 8px 10px;
  border: 1px solid #444;
  border-radius: 4px;
  background-color: #1a1d20;
  color: white;
  font:
    13px 'Poppins',
    sans-serif;

  &:focus {
    outline: none;
    border-color: ${PALETTE.color.interactive};
    box-shadow: 0 0 0 3px ${PALETTE.color.interactiveSubtle};
  }
`;

const InputRow = styled.div`
  display: flex;
  gap: 8px;
`;

const Toggle = styled.button<{ $enabled: boolean; $missing?: boolean }>`
  position: relative;
  width: 46px;
  height: 26px;
  padding: 0;
  border: 1px solid
    ${props =>
      props.$missing ? PALETTE.color.danger : props.$enabled ? PALETTE.color.interactive : '#444'};
  border-radius: 999px;
  background: ${props => (props.$enabled ? PALETTE.color.interactive : '#1a1d20')};
  cursor: pointer;
  transition: all 0.2s;

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${PALETTE.color.interactiveSubtle};
  }

  &::after {
    content: '';
    position: absolute;
    top: 3px;
    left: ${props => (props.$enabled ? '23px' : '3px')};
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: ${props => (props.$enabled ? '#1a1d20' : 'white')};
    transition: left 0.2s;
  }
`;

const ToggleValue = styled.span`
  color: #aaa;
  font-size: 12px;
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const UnitNumberInput = styled(FieldInput)`
  flex: 1;
`;

interface ConfigFieldProps {
  entry: ConfigEntryView;
  value: string;
  onChange: (key: string, value: string) => void;
}

function booleanStateLabel(
  key: string,
  value: boolean,
  stateDescriptions?: { true: string; false: string }
): string {
  if (stateDescriptions) return stateDescriptions[String(value) as 'true' | 'false'];
  if (!key.startsWith('DISABLE_')) return value ? 'Enabled' : 'Disabled';

  const featureName = key.slice('DISABLE_'.length).toLowerCase().replace(/_/g, ' ');
  return `${featureName.charAt(0).toUpperCase()}${featureName.slice(1)} ${
    value ? 'disabled' : 'enabled'
  }`;
}

function timeUnitLabel(unit: string): string {
  const labels: Record<string, string> = {
    s: 'Seconds',
    m: 'Minutes',
    h: 'Hours',
    d: 'Days',
  };

  return labels[unit] ?? unit;
}

export const ConfigField: FC<ConfigFieldProps> = ({ entry, value, onChange }) => {
  const isMissingRequired = entry.required && !entry.hasValue;
  const isBoolean = entry.inputType === 'boolean';
  const isSize = entry.inputType === 'size';
  const isTime = entry.inputType === 'time';
  const isNumber = entry.inputType === 'number';
  const isUnitValue = isSize || isTime;
  const unitMatch = isUnitValue ? value.match(/^(\d+)\s*([A-Za-z]+)$/) : null;
  const units = isSize ? (entry.sizeUnits ?? []) : (entry.timeUnits ?? []);
  const unit = isSize
    ? (unitMatch?.[2].toUpperCase() ?? units[0] ?? '')
    : (unitMatch?.[2].toLowerCase() ?? units[0] ?? '');
  const unitNumber = unitMatch?.[1] ?? '';
  const isEnabled = ['true', '1', 'yes'].includes(value.trim().toLowerCase());

  const renderInput = () => {
    if (isBoolean) {
      return (
        <ToggleRow>
          <Toggle
            id={entry.key}
            type="button"
            role="switch"
            aria-checked={isEnabled}
            aria-label={entry.key}
            $enabled={isEnabled}
            $missing={isMissingRequired}
            onClick={() => onChange(entry.key, isEnabled ? 'false' : 'true')}
          />
          <ToggleValue>
            {booleanStateLabel(entry.key, isEnabled, entry.booleanStateDescriptions)}
          </ToggleValue>
        </ToggleRow>
      );
    }

    if (isUnitValue) {
      return (
        <InputRow>
          <UnitNumberInput
            id={entry.key}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={unitNumber}
            onChange={event =>
              onChange(entry.key, event.target.value ? `${event.target.value}${unit}` : '')
            }
            placeholder="0"
            $missing={isMissingRequired}
          />
          <FieldSelect
            aria-label={`${entry.key} unit`}
            value={unit}
            onChange={event =>
              onChange(entry.key, unitNumber ? `${unitNumber}${event.target.value}` : '')
            }
          >
            {units.map(unit => (
              <option key={unit} value={unit}>
                {isTime ? timeUnitLabel(unit) : unit}
              </option>
            ))}
          </FieldSelect>
        </InputRow>
      );
    }

    return (
      <FieldInput
        id={entry.key}
        type={entry.isSecret ? 'password' : isNumber ? 'number' : 'text'}
        min={isNumber ? entry.numberOptions?.min : undefined}
        max={isNumber ? entry.numberOptions?.max : undefined}
        step={isNumber ? (entry.numberOptions?.integer ? '1' : 'any') : undefined}
        inputMode={isNumber ? (entry.numberOptions?.integer ? 'numeric' : 'decimal') : undefined}
        value={value}
        onChange={event => onChange(entry.key, event.target.value)}
        placeholder={
          entry.isSecret && entry.hasValue
            ? 'A value is saved — enter a new value to replace it'
            : entry.example
              ? `e.g. ${entry.example}`
              : ''
        }
        $missing={isMissingRequired}
        autoComplete={entry.isSecret ? 'new-password' : 'off'}
      />
    );
  };

  return (
    <FieldWrapper>
      <FieldHeader>
        <FieldKey htmlFor={entry.key}>{entry.key}</FieldKey>
        {entry.required && !entry.hasValue && <RequiredBadge>required</RequiredBadge>}
        {entry.hasValue && <AlreadyConfiguredBadge>✓ value saved</AlreadyConfiguredBadge>}
      </FieldHeader>

      <FieldDescription>{entry.description}</FieldDescription>

      {entry.link && (
        <FieldLink href={entry.link} target="_blank" rel="noopener noreferrer">
          ↗ Get this value
        </FieldLink>
      )}

      {entry.example && <FieldExample>Example: {entry.example}</FieldExample>}

      {renderInput()}
    </FieldWrapper>
  );
};
