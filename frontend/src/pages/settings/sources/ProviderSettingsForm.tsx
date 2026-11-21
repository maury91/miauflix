import { useUpdateProviderMutation } from '@features/sources/api/sources.api';
import type { ProviderView } from '@miauflix/backend';
import {
  Button,
  FormSection,
  Message,
  PasswordField,
  Select,
  Switch,
  TextField,
} from '@shared/design-system';
import { useT } from '@shared/i18n';
import { useOptionalNavigation } from '@shared/navigation';
import { useEffect, useState } from 'react';

import { errorMessage } from './errors';
import * as styles from './providerSettingsForm.css';

/** The navigation IDs of a source's settings: one per setting and the submit button. */
const providerSettingNav = (providerId: string, name: string) =>
  `source-setting:${providerId}:${name}`;
const providerSettingsSaveNav = (providerId: string) => `source-settings-save:${providerId}`;

/**
 * A provider's credentials and options: the same FormSection, fields and Message as sign-in and
 * setup. Text settings are TextFields, secrets PasswordFields, choices a Select, flags a Switch.
 */
export function ProviderSettingsForm({
  provider,
  onSaved,
}: {
  provider: ProviderView;
  onSaved: (message: string) => void;
}) {
  const t = useT();
  const [update, { isLoading }] = useUpdateProviderMutation();
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      provider.settingsSchema.map(setting => [
        setting.name,
        provider.settings[setting.name] ?? (setting.type === 'checkbox' ? false : ''),
      ])
    )
  );
  const [error, setError] = useState('');
  const navigation = useOptionalNavigation();
  const firstNavId = provider.settingsSchema[0]
    ? providerSettingNav(provider.id, provider.settingsSchema[0].name)
    : providerSettingsSaveNav(provider.id);
  // Opened from the row's menu: the form's first field is where the remote goes next
  useEffect(() => {
    navigation?.focus(firstNavId);
    // On opening only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setValue = (name: string, value: string | boolean) => {
    setValues(current => ({ ...current, [name]: value }));
    // The failed save was about the values before this edit
    setError('');
  };

  const submit = async () => {
    if (isLoading) return;
    setError('');
    try {
      await update({ id: provider.id, settings: values }).unwrap();
      onSaved(t('sources.savedSettings', { name: provider.name }));
    } catch (requestError) {
      setError(errorMessage(requestError, t('sources.saveFailed')));
    }
  };

  return (
    <div className={styles.form}>
      <FormSection
        title={t('sources.settingsTitle', { name: provider.name })}
        titleHidden
        headingLevel={3}
        onSubmit={() => void submit()}
        busy={isLoading}
        message={
          error ? (
            <Message tone="danger" toneLabel={t('common.error')} live="assertive">
              {error}
            </Message>
          ) : undefined
        }
        actions={
          <Button type="submit" navId={providerSettingsSaveNav(provider.id)} loading={isLoading}>
            {t('sources.saveSettings')}
          </Button>
        }
      >
        {provider.settingsSchema.map(setting => {
          const id = `${provider.id}-${setting.name}`;
          const navId = providerSettingNav(provider.id, setting.name);
          const value = values[setting.name];
          const placeholder = setting.default === undefined ? undefined : String(setting.default);
          let control;
          if (setting.type === 'checkbox') {
            control = (
              <Switch
                id={id}
                label={setting.label}
                checked={value === true}
                onCheckedChange={checked => setValue(setting.name, checked)}
                navId={navId}
              />
            );
          } else if (setting.type === 'select' && setting.options) {
            control = (
              <Select
                id={id}
                label={setting.label}
                fullWidth
                items={[
                  {
                    value: '',
                    label: `Default${placeholder === undefined ? '' : ` (${placeholder})`}`,
                  },
                  ...Object.entries(setting.options).map(([optionValue, label]) => ({
                    value: optionValue,
                    label,
                  })),
                ]}
                value={String(value ?? '')}
                onChange={next => setValue(setting.name, next)}
                navId={navId}
              />
            );
          } else if (setting.type === 'password') {
            control = (
              <PasswordField
                id={id}
                label={setting.label}
                showLabel={t('sources.show', { label: setting.label })}
                hideLabel={t('sources.hide', { label: setting.label })}
                value={String(value ?? '')}
                placeholder={placeholder}
                autoComplete="off"
                onChange={event => setValue(setting.name, event.target.value)}
                navId={navId}
              />
            );
          } else {
            control = (
              <TextField
                id={id}
                label={setting.label}
                value={String(value ?? '')}
                placeholder={placeholder}
                autoComplete="off"
                onChange={event => setValue(setting.name, event.target.value)}
                navId={navId}
              />
            );
          }
          return <div key={setting.name}>{control}</div>;
        })}
      </FormSection>
    </div>
  );
}
