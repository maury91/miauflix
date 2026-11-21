import type { ConfigEntryView } from '@miauflix/backend';
import {
  Link,
  Message,
  NumberField,
  PasswordField,
  Select,
  Switch,
  Text,
  TextField,
} from '@shared/design-system';
import { t as translate, useT } from '@shared/i18n';
import type { FC } from 'react';

import { configFieldNavId } from '../navIds';
import * as styles from './configField.css';

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
  if (!key.startsWith('DISABLE_')) return translate(value ? 'config.enabled' : 'config.disabled');

  const featureName = key.slice('DISABLE_'.length).toLowerCase().replace(/_/g, ' ');
  return `${featureName.charAt(0).toUpperCase()}${featureName.slice(1)} ${
    value ? 'disabled' : 'enabled'
  }`;
}

function timeUnitLabel(unit: string): string {
  return unit === 's' || unit === 'm' || unit === 'h' || unit === 'd'
    ? translate(`config.unit.${unit}`)
    : unit;
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
  SSL: 'SSL',
  TCP: 'TCP',
  TMDB: 'TMDB',
  TTL: 'TTL',
  UI: 'UI',
  URL: 'URL',
  VPN: 'VPN',
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

const toNumber = (text: string): number | null => {
  if (text.trim() === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * One configuration value, as the design system control for its kind: a Switch for flags, a
 * Select for a fixed set, a NumberField (with its unit's Select for sizes and durations), a
 * PasswordField for secrets and a TextField otherwise. The raw environment key stays in the help
 * text, for administrators who know their `.env`.
 */
export const ConfigField: FC<ConfigFieldProps> = ({
  entry,
  value,
  onChange,
  hasTestFailure = false,
}) => {
  const t = useT();
  const fieldLabel = entry.label ?? humanizeConfigKey(entry.key);
  const navId = configFieldNavId(entry.key);
  const isMissingRequired = entry.required && !entry.hasValue;
  const indicator = isMissingRequired ? t('config.required') : undefined;
  const error = hasTestFailure ? t('config.lastTestFailed') : undefined;
  const isSize = entry.inputType === 'size';
  const isTime = entry.inputType === 'time';
  const integer = entry.numberOptions?.integer ?? false;
  const numberSteps = {
    decrementLabel: t('config.decrease', { field: fieldLabel }),
    incrementLabel: t('config.increase', { field: fieldLabel }),
  };
  const help = `${entry.description} (${entry.key})`;

  const renderControl = () => {
    if (entry.inputType === 'boolean') {
      const enabled = ['true', '1', 'yes'].includes(value.trim().toLowerCase());
      return (
        <Switch
          navId={navId}
          id={entry.key}
          label={fieldLabel}
          description={
            <>
              <span>{booleanStateLabel(entry.key, enabled, entry.booleanStateDescriptions)}</span>
              {`. ${help}`}
            </>
          }
          checked={enabled}
          onCheckedChange={checked => onChange(entry.key, checked ? 'true' : 'false')}
        />
      );
    }

    if (entry.inputType === 'select') {
      return (
        <Select
          navId={navId}
          id={entry.key}
          label={fieldLabel}
          indicator={indicator}
          description={help}
          error={error}
          fullWidth
          items={Object.entries(entry.options ?? {}).map(([optionValue, optionDescription]) => ({
            value: optionValue,
            label: `${optionValue} — ${optionDescription}`,
          }))}
          value={value || null}
          onChange={next => onChange(entry.key, next)}
        />
      );
    }

    if (isSize || isTime) {
      const match = value.match(/^(\d+)\s*([A-Za-z]+)$/);
      const units = isSize ? (entry.sizeUnits ?? []) : (entry.timeUnits ?? []);
      const unit = isSize
        ? (match?.[2].toUpperCase() ?? units[0] ?? '')
        : (match?.[2].toLowerCase() ?? units[0] ?? '');
      const amount = match?.[1] ?? '';
      return (
        <div>
          <div className={styles.unitRow}>
            <div className={styles.unitNumber}>
              <NumberField
                navId={navId}
                id={entry.key}
                label={fieldLabel}
                indicator={indicator}
                // Under the number and its unit both, so the unit lines up with the input
                aria-describedby={`${entry.key}-help`}
                error={error}
                min={0}
                step={1}
                {...numberSteps}
                value={toNumber(amount)}
                onChange={next => onChange(entry.key, next === null ? '' : `${next}${unit}`)}
                placeholder="0"
              />
            </div>
            <div className={styles.unitSelect}>
              <Select
                navId={`${navId}:unit`}
                label={t('config.unitLabel', { field: fieldLabel })}
                labelHidden
                items={units.map(option => ({
                  value: option,
                  label: isTime ? timeUnitLabel(option) : option,
                }))}
                value={unit || null}
                onChange={next => onChange(entry.key, amount ? `${amount}${next}` : '')}
              />
            </div>
          </div>
          <div id={`${entry.key}-help`} className={styles.unitHelp}>
            <Text variant="caption" tone="secondary">
              {help}
            </Text>
          </div>
        </div>
      );
    }

    if (entry.inputType === 'number') {
      return (
        <NumberField
          navId={navId}
          id={entry.key}
          label={fieldLabel}
          indicator={indicator}
          description={help}
          error={error}
          min={entry.numberOptions?.min}
          max={entry.numberOptions?.max}
          step={integer ? 1 : 0.01}
          {...numberSteps}
          inputMode={integer ? 'numeric' : 'decimal'}
          value={toNumber(value)}
          onChange={next => onChange(entry.key, next === null ? '' : String(next))}
        />
      );
    }

    const placeholder =
      entry.isSecret && entry.hasValue
        ? t('config.secretSaved')
        : entry.example
          ? t('config.example', { example: entry.example })
          : undefined;
    if (entry.isSecret) {
      return (
        <PasswordField
          navId={navId}
          id={entry.key}
          label={fieldLabel}
          indicator={indicator}
          description={help}
          error={error}
          showLabel={t('config.show', { field: fieldLabel })}
          hideLabel={t('config.hide', { field: fieldLabel })}
          value={value}
          placeholder={placeholder}
          autoComplete="new-password"
          onChange={event => onChange(entry.key, event.target.value)}
        />
      );
    }
    return (
      <TextField
        navId={navId}
        id={entry.key}
        label={fieldLabel}
        indicator={indicator}
        description={help}
        error={error}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={event => onChange(entry.key, event.target.value)}
      />
    );
  };

  return (
    <div data-config-field={entry.key} data-test-failure={hasTestFailure || undefined}>
      {renderControl()}
      {entry.warning && (
        <div className={styles.extra}>
          <Message tone="warning">{t('config.warning', { warning: entry.warning })}</Message>
        </div>
      )}
      {entry.link && (
        <div className={styles.extra}>
          <Link navId={`${navId}:link`} href={entry.link} variant="standalone" external>
            {entry.linkLabel ?? t('config.openSetupPage')}
          </Link>
        </div>
      )}
    </div>
  );
};
