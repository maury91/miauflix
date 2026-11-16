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
import { type FocusEvent, useState } from 'react';

import { errorMessage } from './errors';
import * as styles from './providerSettingsForm.css';

/** The submit button's key in the focus map: no setting can be named with a leading colon. */
const SUBMIT = ':submit';

interface FocusedPart {
  /** The setting's name, or SUBMIT. */
  key: string;
  /** For a password: the input or its reveal toggle. */
  part: 'input' | 'reveal';
}

/**
 * Which part of the form holds DOM focus. Sources still moves DOM focus itself (its own key
 * handling, not the navigation layer), so this hands that focus to the design system's controls as
 * their virtual focus; it goes once Sources moves to the navigation layer (phase 6).
 */
function useDomFocus() {
  const [focused, setFocused] = useState<FocusedPart | null>(null);
  const track = (event: FocusEvent<HTMLElement>) => {
    const target = event.target;
    const owner = target.closest<HTMLElement>('[data-provider-setting]');
    const key = owner?.dataset['providerSetting'];
    setFocused(key ? { key, part: target instanceof HTMLInputElement ? 'input' : 'reveal' } : null);
  };
  const clear = (event: FocusEvent<HTMLElement>) => {
    if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)))
      setFocused(null);
  };
  return { focused, containerProps: { onFocus: track, onBlur: clear } };
}

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
  const { focused, containerProps } = useDomFocus();
  const isFocused = (key: string) => focused?.key === key;
  const setValue = (name: string, value: string | boolean) =>
    setValues(current => ({ ...current, [name]: value }));

  const submit = async () => {
    if (isLoading) return;
    setError('');
    try {
      await update({ id: provider.id, settings: values }).unwrap();
      onSaved(`Saved settings for ${provider.name}.`);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not save settings.'));
    }
  };

  return (
    <div className={styles.form} {...containerProps}>
      <FormSection
        title={`${provider.name} settings`}
        titleHidden
        headingLevel={3}
        onSubmit={() => void submit()}
        busy={isLoading}
        message={
          error ? (
            <Message tone="danger" toneLabel="Error" live="assertive">
              {error}
            </Message>
          ) : undefined
        }
        actions={
          <Button
            type="submit"
            data-provider-setting={SUBMIT}
            loading={isLoading}
            focused={isFocused(SUBMIT)}
          >
            Save settings
          </Button>
        }
      >
        {provider.settingsSchema.map(setting => {
          const id = `${provider.id}-${setting.name}`;
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
                focused={isFocused(setting.name)}
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
                focused={isFocused(setting.name)}
              />
            );
          } else if (setting.type === 'password') {
            control = (
              <PasswordField
                id={id}
                label={setting.label}
                showLabel={`Show ${setting.label}`}
                hideLabel={`Hide ${setting.label}`}
                value={String(value ?? '')}
                placeholder={placeholder}
                autoComplete="off"
                onChange={event => setValue(setting.name, event.target.value)}
                focusedPart={isFocused(setting.name) ? focused?.part : undefined}
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
                focused={isFocused(setting.name)}
              />
            );
          }
          return (
            <div key={setting.name} data-provider-setting={setting.name}>
              {control}
            </div>
          );
        })}
      </FormSection>
    </div>
  );
}
