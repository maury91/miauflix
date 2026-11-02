import { useUpdateProviderMutation } from '@features/sources/api/sources.api';
import type { ProviderView } from '@miauflix/backend';
import { ActionRow, Button, FieldLabel, Input, Select, Switch } from '@shared/ui';
import { type FormEvent, useState } from 'react';
import styled from 'styled-components';

import { errorMessage } from './errors';
import { Message } from './styles';

const Form = styled.form`
  display: grid;
  gap: 12px;
  max-width: 560px;
`;

const Field = styled.div`
  display: grid;
  gap: 6px;
`;

const Inline = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await update({ id: provider.id, settings: values }).unwrap();
      onSaved(`Saved settings for ${provider.name}.`);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not save settings.'));
    }
  };

  return (
    <Form onSubmit={event => void submit(event)} aria-label={`${provider.name} settings`}>
      {provider.settingsSchema.map(setting => {
        const id = `${provider.id}-${setting.name}`;
        return (
          <Field key={setting.name}>
            {setting.type === 'checkbox' ? (
              <Inline>
                <Switch
                  id={id}
                  aria-label={setting.label}
                  checked={values[setting.name] === true}
                  onCheckedChange={checked =>
                    setValues(current => ({ ...current, [setting.name]: checked }))
                  }
                />
                <span>{setting.label}</span>
              </Inline>
            ) : setting.type === 'select' && setting.options ? (
              <>
                <FieldLabel htmlFor={id}>{setting.label}</FieldLabel>
                <Select
                  id={id}
                  value={String(values[setting.name] ?? '')}
                  onChange={event =>
                    setValues(current => ({ ...current, [setting.name]: event.target.value }))
                  }
                >
                  <option value="">
                    Default{setting.default === undefined ? '' : ` (${String(setting.default)})`}
                  </option>
                  {Object.entries(setting.options).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </>
            ) : (
              <>
                <FieldLabel htmlFor={id}>{setting.label}</FieldLabel>
                <Input
                  id={id}
                  type={setting.type === 'password' ? 'password' : 'text'}
                  value={String(values[setting.name] ?? '')}
                  placeholder={setting.default === undefined ? undefined : String(setting.default)}
                  onChange={event =>
                    setValues(current => ({ ...current, [setting.name]: event.target.value }))
                  }
                />
              </>
            )}
          </Field>
        );
      })}
      {error && <Message role="alert">{error}</Message>}
      <ActionRow>
        <Button
          type="submit"
          size="small"
          appearance="settings"
          color="primary"
          disabled={isLoading}
        >
          {isLoading ? 'Saving…' : 'Save settings'}
        </Button>
      </ActionRow>
    </Form>
  );
}
