import type { ConfigEntryView } from '@miauflix/backend';
import { SETTINGS_PALETTE } from '@shared/config/constants';
import type { FC, SVGProps } from 'react';
import styled from 'styled-components';

import LinkIcon from '~icons/line-md/link';

const QuestionIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    {...props}
  >
    <circle cx="12" cy="12" r="9" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 10a3 3 0 1 1 4.8 2.4c-.73.55-1.3.6-1.8 1.6"
    />
    <path strokeLinecap="round" d="M12 17v.01" />
  </svg>
);

const FieldWrapper = styled.div<{ $hasError?: boolean }>`
  margin-bottom: 20px;
  ${props =>
    props.$hasError &&
    `
      margin-inline: -10px;
      padding: 10px;
      border: 1px solid ${SETTINGS_PALETTE.color.danger};
      border-radius: 8px;
      background: ${SETTINGS_PALETTE.color.dangerSubtle};
    `}
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
  color: ${SETTINGS_PALETTE.text.primary};
  font-family: 'Poppins', sans-serif;
`;

const FieldKeyAbbr = styled.abbr`
  text-decoration: none;
  cursor: help;
`;

const FieldHelp = styled.span`
  position: relative;
  display: inline-flex;
  color: ${SETTINGS_PALETTE.text.secondary};
  cursor: help;

  &:focus-visible {
    outline: none;
    color: ${SETTINGS_PALETTE.color.interactive};
  }

  &::after {
    content: attr(data-tooltip);
    position: absolute;
    z-index: 1;
    top: calc(100% + 8px);
    left: 50%;
    width: max-content;
    max-width: 280px;
    padding: 8px 10px;
    border: 1px solid ${SETTINGS_PALETTE.background.border};
    border-radius: 6px;
    background: ${SETTINGS_PALETTE.background.input};
    color: ${SETTINGS_PALETTE.text.primary};
    font:
      12px/1.4 'Poppins',
      sans-serif;
    transform: translateX(-50%);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }

  &:hover::after,
  &:focus-visible::after {
    opacity: 1;
  }
`;

const RequiredBadge = styled.span`
  font-size: 10px;
  font-weight: 600;
  color: ${SETTINGS_PALETTE.color.danger};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const FieldDescription = styled.p`
  font-size: 12px;
  color: ${SETTINGS_PALETTE.text.secondary};
  margin: 0 0 6px 0;
  line-height: 1.4;
`;

const FieldWarning = styled.p`
  font-size: 12px;
  color: ${SETTINGS_PALETTE.color.warning};
  margin: 0 0 6px;
  line-height: 1.4;
`;

const FieldLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: ${SETTINGS_PALETTE.color.interactive};
  text-decoration: none;
  margin-bottom: 6px;

  &:hover {
    text-decoration: underline;
  }
`;

const FieldInput = styled.input<{ $missing?: boolean }>`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid
    ${props =>
      props.$missing ? SETTINGS_PALETTE.color.danger : SETTINGS_PALETTE.background.border};
  border-radius: 4px;
  background-color: ${SETTINGS_PALETTE.background.input};
  color: white;
  font-size: 13px;
  font-family: 'Poppins', sans-serif;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: ${props =>
      props.$missing ? SETTINGS_PALETTE.color.danger : SETTINGS_PALETTE.color.interactive};
    box-shadow: 0 0 0 3px
      ${props =>
        props.$missing
          ? SETTINGS_PALETTE.color.dangerSubtle
          : SETTINGS_PALETTE.color.interactiveSubtle};
  }

  &::placeholder {
    color: #70777a;
  }
`;

const FieldSelect = styled.select`
  padding: 8px 10px;
  border: 1px solid ${SETTINGS_PALETTE.background.border};
  border-radius: 4px;
  background-color: ${SETTINGS_PALETTE.background.input};
  color: white;
  font:
    13px 'Poppins',
    sans-serif;

  &:focus {
    outline: none;
    border-color: ${SETTINGS_PALETTE.color.interactive};
    box-shadow: 0 0 0 3px ${SETTINGS_PALETTE.color.interactiveSubtle};
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
      props.$missing
        ? SETTINGS_PALETTE.color.danger
        : props.$enabled
          ? SETTINGS_PALETTE.color.interactive
          : SETTINGS_PALETTE.background.border};
  border-radius: 999px;
  background: ${props =>
    props.$enabled ? SETTINGS_PALETTE.color.interactive : SETTINGS_PALETTE.background.input};
  cursor: pointer;
  transition: all 0.2s;

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${SETTINGS_PALETTE.color.interactiveSubtle};
  }

  &::after {
    content: '';
    position: absolute;
    top: 3px;
    left: ${props => (props.$enabled ? '23px' : '3px')};
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: ${props => (props.$enabled ? SETTINGS_PALETTE.background.input : 'white')};
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
  hasTestFailure?: boolean;
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

const DISPLAY_TOKEN_OVERRIDES: Record<string, string> = {
  API: 'API',
  CORS: 'CORS',
  DHT: 'DHT',
  ENV: 'Environment',
  FLARESOLVERR: 'FlareSolverr',
  HTTP: 'HTTP',
  HTTPS: 'HTTPS',
  ID: 'ID',
  IP: 'IP',
  JWT: 'JWT',
  NODE: 'Node.js',
  OTEL: 'OTEL',
  OTLP: 'OTLP',
  RARBG: 'RARBG',
  SSL: 'SSL',
  TCP: 'TCP',
  TMDB: 'TMDB',
  TTL: 'TTL',
  UI: 'UI',
  URL: 'URL',
  VPN: 'VPN',
  YTS: 'YTS',
};

function humanizeConfigKey(key: string): string {
  const tokens = key
    .split('_')
    .filter(Boolean)
    .map(token => DISPLAY_TOKEN_OVERRIDES[token] ?? `${token[0]}${token.slice(1).toLowerCase()}`);

  if (key.includes('__') && tokens.length > 1 && tokens[0] === tokens[1]) {
    tokens.splice(1, 1);
  }

  return tokens.join(' ');
}

export const ConfigField: FC<ConfigFieldProps> = ({
  entry,
  value,
  onChange,
  hasTestFailure = false,
}) => {
  const fieldLabel = entry.label ?? humanizeConfigKey(entry.key);
  const isMissingRequired = (entry.required && !entry.hasValue && !value.trim()) || hasTestFailure;
  const isBoolean = entry.inputType === 'boolean';
  const isSize = entry.inputType === 'size';
  const isTime = entry.inputType === 'time';
  const isNumber = entry.inputType === 'number';
  const isSelect = entry.inputType === 'select';
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
            aria-label={fieldLabel}
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

    if (isSelect) {
      return (
        <FieldSelect
          id={entry.key}
          value={value}
          onChange={event => onChange(entry.key, event.target.value)}
        >
          {Object.entries(entry.options ?? {}).map(([optionValue, optionDescription]) => (
            <option key={optionValue} value={optionValue}>
              {optionValue} — {optionDescription}
            </option>
          ))}
        </FieldSelect>
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
            aria-label={`${fieldLabel} unit`}
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
    <FieldWrapper $hasError={hasTestFailure} data-test-failure={hasTestFailure || undefined}>
      <FieldHeader>
        <FieldKey htmlFor={entry.key}>
          <FieldKeyAbbr title={`Configuration key: ${entry.key}`}>{fieldLabel}</FieldKeyAbbr>
        </FieldKey>
        {!entry.link && (
          <FieldHelp
            role="img"
            tabIndex={0}
            aria-label={entry.description}
            data-tooltip={entry.description}
          >
            <QuestionIcon aria-hidden="true" />
          </FieldHelp>
        )}
        {entry.required && !entry.hasValue && <RequiredBadge>required</RequiredBadge>}
      </FieldHeader>

      {entry.link && <FieldDescription>{entry.description}</FieldDescription>}

      {entry.warning && <FieldWarning role="note">Warning: {entry.warning}</FieldWarning>}

      {entry.link && (
        <FieldLink href={entry.link} target="_blank" rel="noopener noreferrer">
          <LinkIcon /> {entry.linkLabel ?? 'Open setup page'}
        </FieldLink>
      )}

      {renderInput()}
    </FieldWrapper>
  );
};
