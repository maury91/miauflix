import {
  useAddRepositoryMutation,
  useGetRepositoriesQuery,
  useRefreshRepositoryMutation,
  useRemoveRepositoryMutation,
} from '@features/sources/api/sources.api';
import { SETTINGS_PALETTE } from '@shared/config/constants';
import { Button, FieldLabel, Input } from '@shared/ui';
import { type FormEvent, useState } from 'react';
import styled from 'styled-components';

import SourcesAddProviders from '../SourcesAddProviders';
import { errorMessage } from './errors';
import { Badge, BORDER, IconBox, Message, Muted, Panel, Pill } from './styles';

import ChevronIcon from '~icons/mdi/chevron-down';
import SettingsIcon from '~icons/mdi/cog-outline';

const Toggle = styled.button`
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 18px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${SETTINGS_PALETTE.color.interactive};
    outline-offset: -2px;
  }
`;

const Grow = styled.span`
  flex: 1;
  min-width: 0;
`;

const Title = styled.span`
  display: block;
  font-size: 18px;
  font-weight: 600;
  text-transform: none;
`;

const Chevron = styled.span<{ $open: boolean }>`
  display: grid;
  font-size: 24px;
  transform: rotate(${({ $open }) => ($open ? 180 : 0)}deg);
`;

const Body = styled.div`
  display: grid;
  gap: 4px;
  padding: 0 18px 20px;
`;

const Section = styled.section`
  display: grid;
  gap: 12px;
  padding: 18px 0 4px;
  border-top: 1px solid ${BORDER};
`;

const Heading = styled.h3`
  margin: 0;
  text-transform: none;
  font-size: 16px;
  font-weight: 600;
  text-transform: none;
`;

const List = styled.ul`
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const RepositoryRow = styled.li`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 12px 14px;
  border: 1px solid ${BORDER};
  border-radius: 10px;
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const AddRow = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
`;

interface AdvancedSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

export function AdvancedSetup({ open, onOpenChange, onNotice, onError }: AdvancedSetupProps) {
  const repositories = useGetRepositoriesQuery();
  const [addRepository, adding] = useAddRepositoryMutation();
  const [refreshRepository] = useRefreshRepositoryMutation();
  const [removeRepository] = useRemoveRepositoryMutation();
  const [url, setUrl] = useState('');

  const run = async (task: () => Promise<unknown>, success: string, failure: string) => {
    try {
      await task();
      onNotice(success);
    } catch (error) {
      onError(errorMessage(error, failure));
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = url.trim();
    if (!value) return;
    void run(
      async () => {
        await addRepository({ url: value }).unwrap();
        setUrl('');
      },
      'Repository added.',
      'Could not add repository.'
    );
  };

  return (
    <Panel id="advanced-setup">
      <Toggle
        type="button"
        aria-expanded={open}
        aria-controls="advanced-setup-body"
        onClick={() => onOpenChange(!open)}
      >
        <IconBox $size={44} aria-hidden="true">
          <SettingsIcon />
        </IconBox>
        <Grow>
          <Title>Advanced setup</Title>
          <Muted>Jackett, Torznab endpoints, and repositories.</Muted>
        </Grow>
        <Pill>3 items</Pill>
        <Chevron $open={open} aria-hidden="true">
          <ChevronIcon />
        </Chevron>
      </Toggle>
      {open && (
        <Body id="advanced-setup-body">
          <SourcesAddProviders onNotice={onNotice} />
          <Section aria-label="Repositories">
            <Heading>Repositories</Heading>
            <Muted>A repository is a list of sources. Add one by its web address.</Muted>
            {repositories.error && !repositories.data && (
              <Message role="alert">Could not load repositories.</Message>
            )}
            <List aria-label="Repositories">
              {(repositories.data ?? []).map(repository => (
                <RepositoryRow key={repository.id}>
                  <div>
                    <strong>{repository.name ?? repository.url}</strong>{' '}
                    {repository.builtIn && <Badge>built-in</Badge>}
                    {!repository.builtIn && repository.id !== 'local:user' && (
                      <Muted>{repository.url}</Muted>
                    )}
                    <Muted>
                      {repository.providerCount} provider{repository.providerCount === 1 ? '' : 's'}
                      {repository.lastFetchedAt
                        ? ` · updated ${new Date(repository.lastFetchedAt).toLocaleString()}`
                        : ''}
                    </Muted>
                    {repository.lastError && <Muted>Problem: {repository.lastError}</Muted>}
                  </div>
                  {!repository.builtIn && repository.id !== 'local:user' && (
                    <Controls>
                      <Button
                        size="small"
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
                        size="small"
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
                </RepositoryRow>
              ))}
            </List>
            <AddRow onSubmit={submit} aria-label="Add repository">
              <div>
                <FieldLabel htmlFor="repository-url">Repository URL</FieldLabel>
                <Input
                  id="repository-url"
                  type="url"
                  placeholder="https://example.com/providers.json"
                  value={url}
                  onChange={event => setUrl(event.target.value)}
                />
              </div>
              <Button
                type="submit"
                size="small"
                appearance="settings"
                color="primary"
                disabled={adding.isLoading || !url.trim()}
              >
                {adding.isLoading ? 'Adding…' : 'Add repository'}
              </Button>
            </AddRow>
          </Section>
        </Body>
      )}
    </Panel>
  );
}
