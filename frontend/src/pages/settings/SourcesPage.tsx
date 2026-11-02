import {
  useAddRepositoryMutation,
  useGetProvidersQuery,
  useGetRepositoriesQuery,
  useRefreshRepositoryMutation,
  useRemoveRepositoryMutation,
  useReorderProvidersMutation,
  useTestProviderMutation,
  useUpdateProviderMutation,
} from '@features/sources/api/sources.api';
import type { ProviderView } from '@miauflix/backend';
import { SETTINGS_PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { ActionRow, Button, FieldLabel, Input, Switch } from '@shared/ui';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

const Page = styled.main`
  position: fixed;
  inset: 0;
  z-index: 1000;
  overflow-y: auto;
  background: ${SETTINGS_PALETTE.background.primary};
  color: ${SETTINGS_PALETTE.text.primary};
  font-family: 'Poppins', sans-serif;
`;

const Content = styled.div`
  max-width: 920px;
  margin: 0 auto;
  padding: 132px 24px 40px;

  @media (max-width: 720px) {
    padding: 96px 16px 32px;
  }
`;

const Title = styled.h1`
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 400;
`;

const SectionTitle = styled.h2`
  margin: 32px 0 12px;
  font-size: 20px;
  font-weight: 400;
`;

const Description = styled.p`
  margin: 0 0 16px;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 14px;
  line-height: 1.5;
`;

const List = styled.div`
  display: grid;
  gap: 12px;
`;

const Item = styled.article`
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid ${SETTINGS_PALETTE.background.border};
  border-radius: 10px;
  background: ${SETTINGS_PALETTE.background.surface};
`;

const ItemHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const ItemTitle = styled.h3`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  overflow-wrap: anywhere;
`;

const Badge = styled.span`
  padding: 2px 8px;
  border: 1px solid ${SETTINGS_PALETTE.background.border};
  border-radius: 999px;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 11px;
  font-weight: 400;
  text-transform: uppercase;
`;

const HEALTH_COLOR = {
  ok: '#3ecf8e',
  degraded: '#f5a524',
  cooldown: '#f5a524',
  disabled: '#6b7280',
} as const;

const Dot = styled.span<{ $state: ProviderView['health']['state'] }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${({ $state }) => HEALTH_COLOR[$state]};
`;

const Details = styled.p`
  margin: 5px 0 0;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
`;

const Message = styled.p`
  margin: 12px 0;
  color: ${SETTINGS_PALETTE.text.secondary};
  line-height: 1.5;
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`;

const Form = styled.form`
  display: grid;
  gap: 12px;
`;

const Field = styled.div`
  display: grid;
  gap: 6px;
`;

const AddRow = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin-top: 12px;
`;

interface SourcesPageProps {
  onDismiss: () => void;
}

function errorMessage(error: unknown, fallback: string): string {
  const data = (error as { data?: unknown } | undefined)?.data;
  return typeof data === 'string' && data ? data : fallback;
}

function ProviderSettingsForm({
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
              <Controls>
                <Switch
                  id={id}
                  aria-label={setting.label}
                  checked={values[setting.name] === true}
                  onCheckedChange={checked =>
                    setValues(current => ({ ...current, [setting.name]: checked }))
                  }
                />
                <span>{setting.label}</span>
              </Controls>
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
        <Button type="submit" appearance="settings" color="primary" disabled={isLoading}>
          {isLoading ? 'Saving…' : 'Save settings'}
        </Button>
      </ActionRow>
    </Form>
  );
}

export default function SourcesPage({ onDismiss }: SourcesPageProps) {
  const providers = useGetProvidersQuery(undefined, { pollingInterval: 10_000 });
  const repositories = useGetRepositoriesQuery();
  const [updateProvider, updating] = useUpdateProviderMutation();
  const [reorder, reordering] = useReorderProvidersMutation();
  const [testProvider] = useTestProviderMutation();
  const [addRepository, adding] = useAddRepositoryMutation();
  const [refreshRepository] = useRefreshRepositoryMutation();
  const [removeRepository] = useRemoveRepositoryMutation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    backRef.current?.focus({ preventScroll: true });
  }, []);

  const cycleButtons = (direction: -1 | 1) => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-sources-page] button:not(:disabled), [data-sources-page] input:not(:disabled)'
      )
    );
    if (!buttons.length) return true;
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    buttons[(index + direction + buttons.length) % buttons.length]?.focus({ preventScroll: true });
    return true;
  };
  const navigationRef = useKeyboardNavigation({
    onUp: () => cycleButtons(-1),
    onDown: () => cycleButtons(1),
    onBack: () => {
      onDismiss();
      return true;
    },
  });

  const run = async (task: () => Promise<unknown>, success: string, failure: string) => {
    setNotice('');
    setError('');
    try {
      await task();
      setNotice(success);
    } catch (requestError) {
      setError(errorMessage(requestError, failure));
    }
  };

  const ordered = [...(providers.data ?? [])].sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id)
  );
  const move = (provider: ProviderView, offset: -1 | 1) => {
    const ids = ordered.map(p => p.id);
    const from = ids.indexOf(provider.id);
    const to = from + offset;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    void run(
      () => reorder(ids).unwrap(),
      `Moved ${provider.name}.`,
      `Could not move ${provider.name}.`
    );
  };
  const busy = updating.isLoading || reordering.isLoading;

  const submitRepository = (event: FormEvent) => {
    event.preventDefault();
    const url = repositoryUrl.trim();
    if (!url) return;
    void run(
      async () => {
        await addRepository({ url }).unwrap();
        setRepositoryUrl('');
      },
      'Repository added.',
      'Could not add repository.'
    );
  };

  return (
    <Page ref={navigationRef} data-sources-page aria-labelledby="sources-title">
      <Content>
        <Title id="sources-title">Sources</Title>
        <Description>
          Providers are searched in the order shown, starting at the top. Add a repository URL to
          install more providers.
        </Description>

        <div role="status" aria-live="polite">
          {notice && <Message>{notice}</Message>}
        </div>
        {error && <Message role="alert">{error}</Message>}

        <SectionTitle>Providers</SectionTitle>
        {providers.isLoading && <Message role="status">Loading providers…</Message>}
        {!providers.isLoading && providers.error && !providers.data && (
          <>
            <Message role="alert">Could not load providers.</Message>
            <Button
              appearance="settings"
              color="secondary"
              onClick={() => void providers.refetch()}
            >
              Try again
            </Button>
          </>
        )}
        <List role="list" aria-label="Providers">
          {ordered.map((provider, index) => (
            <Item key={provider.id}>
              <ItemHeader>
                <div>
                  <ItemTitle>
                    <Dot
                      $state={provider.health.state}
                      role="img"
                      aria-label={`Health: ${provider.health.state}`}
                    />
                    {provider.name}
                    <Badge>{provider.kind}</Badge>
                  </ItemTitle>
                  <Details>
                    Today {provider.usage.today}
                    {provider.usage.dailyBudget ? ` / ${provider.usage.dailyBudget}` : ''} requests
                    {provider.version ? ` · v${provider.version}` : ''}
                  </Details>
                  {provider.health.lastError && (
                    <Details>Last error: {provider.health.lastError}</Details>
                  )}
                  {provider.health.cooldownUntil && (
                    <Details>
                      Paused until {new Date(provider.health.cooldownUntil).toLocaleString()}
                    </Details>
                  )}
                </div>
                <Controls>
                  <Switch
                    aria-label={`${provider.enabled ? 'Disable' : 'Enable'} ${provider.name}`}
                    checked={provider.enabled}
                    disabled={busy}
                    onCheckedChange={enabled =>
                      void run(
                        () => updateProvider({ id: provider.id, enabled }).unwrap(),
                        `${provider.name} ${enabled ? 'enabled' : 'disabled'}.`,
                        `Could not update ${provider.name}.`
                      )
                    }
                  />
                  <Button
                    appearance="settings"
                    color="secondary"
                    disabled={busy || index === 0}
                    aria-label={`Move ${provider.name} up`}
                    onClick={() => move(provider, -1)}
                  >
                    Up
                  </Button>
                  <Button
                    appearance="settings"
                    color="secondary"
                    disabled={busy || index === ordered.length - 1}
                    aria-label={`Move ${provider.name} down`}
                    onClick={() => move(provider, 1)}
                  >
                    Down
                  </Button>
                  <Button
                    appearance="settings"
                    color="secondary"
                    aria-label={`Test ${provider.name}`}
                    onClick={() =>
                      void (async () => {
                        setNotice('');
                        setError('');
                        try {
                          const result = await testProvider(provider.id).unwrap();
                          if (result.success) setNotice(`${provider.name}: ${result.message}`);
                          else setError(`${provider.name}: ${result.message}`);
                        } catch (requestError) {
                          setError(errorMessage(requestError, `Could not test ${provider.name}.`));
                        }
                      })()
                    }
                  >
                    Test
                  </Button>
                  <Button
                    appearance="settings"
                    color="secondary"
                    aria-expanded={expanded === provider.id}
                    aria-label={`Settings for ${provider.name}`}
                    onClick={() => setExpanded(expanded === provider.id ? null : provider.id)}
                  >
                    Settings
                  </Button>
                </Controls>
              </ItemHeader>
              {expanded === provider.id && (
                <ProviderSettingsForm
                  provider={provider}
                  onSaved={message => {
                    setNotice(message);
                    setExpanded(null);
                  }}
                />
              )}
            </Item>
          ))}
        </List>

        <SectionTitle>Repositories</SectionTitle>
        {repositories.error && !repositories.data && (
          <Message role="alert">Could not load repositories.</Message>
        )}
        <List role="list" aria-label="Repositories">
          {(repositories.data ?? []).map(repository => (
            <Item key={repository.id}>
              <ItemHeader>
                <div>
                  <ItemTitle>
                    {repository.name ?? repository.url}
                    {repository.builtIn && <Badge>built-in</Badge>}
                  </ItemTitle>
                  {!repository.builtIn && <Details>{repository.url}</Details>}
                  <Details>
                    {repository.providerCount} provider{repository.providerCount === 1 ? '' : 's'}
                    {repository.lastFetchedAt
                      ? ` · updated ${new Date(repository.lastFetchedAt).toLocaleString()}`
                      : ''}
                  </Details>
                  {repository.lastError && <Details>Problem: {repository.lastError}</Details>}
                </div>
                {!repository.builtIn && (
                  <Controls>
                    <Button
                      appearance="settings"
                      color="secondary"
                      aria-label={`Refresh ${repository.name ?? repository.url}`}
                      onClick={() =>
                        void run(
                          () => refreshRepository(repository.id).unwrap(),
                          'Repository refreshed.',
                          'Could not refresh repository.'
                        )
                      }
                    >
                      Refresh
                    </Button>
                    <Button
                      appearance="settings"
                      color="secondary"
                      aria-label={`Remove ${repository.name ?? repository.url}`}
                      onClick={() =>
                        void run(
                          () => removeRepository(repository.id).unwrap(),
                          'Repository removed.',
                          'Could not remove repository.'
                        )
                      }
                    >
                      Remove
                    </Button>
                  </Controls>
                )}
              </ItemHeader>
            </Item>
          ))}
        </List>
        <AddRow onSubmit={submitRepository} aria-label="Add repository">
          <Input
            aria-label="Repository URL"
            type="url"
            placeholder="https://example.com/providers.json"
            value={repositoryUrl}
            onChange={event => setRepositoryUrl(event.target.value)}
          />
          <Button
            type="submit"
            appearance="settings"
            color="primary"
            disabled={adding.isLoading || !repositoryUrl.trim()}
          >
            {adding.isLoading ? 'Adding…' : 'Add repository'}
          </Button>
        </AddRow>

        <ActionRow>
          <Button ref={backRef} appearance="settings" color="secondary" onClick={onDismiss}>
            Back to Settings
          </Button>
        </ActionRow>
      </Content>
    </Page>
  );
}
