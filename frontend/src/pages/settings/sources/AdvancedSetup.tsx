import {
  useAddRepositoryMutation,
  useGetRepositoriesQuery,
  useRefreshRepositoryMutation,
  useRemoveRepositoryMutation,
} from '@features/sources/api/sources.api';
import {
  Badge,
  Button,
  Disclosure,
  FormSection,
  IconButton,
  List,
  ListItem,
  Message,
  Section,
  TextField,
} from '@shared/design-system';
import { useState } from 'react';

import SourcesAddProviders from '../SourcesAddProviders';
import { errorMessage } from './errors';
import { ADVANCED_NAV } from './navIds';
import * as styles from './sources.css';

import RefreshIcon from '~icons/mdi/refresh';
import RemoveIcon from '~icons/mdi/trash-can-outline';

interface AdvancedSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

/** Jackett, Torznab and repositories: collapsed until asked for, since most people never need it. */
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
  const submit = () => {
    const value = url.trim();
    if (!value || adding.isLoading) return;
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
    <div id="advanced-setup">
      <Disclosure
        navId={ADVANCED_NAV.toggle}
        title="Advanced setup"
        description="Jackett, Torznab endpoints, and repositories."
        headingLevel={2}
        expanded={open}
        onExpandedChange={onOpenChange}
      >
        <SourcesAddProviders onNotice={onNotice} />
        <div className={styles.setupPart}>
          <Section
            title="Repositories"
            headingLevel={3}
            description="A repository is a list of sources. Add one by its web address."
          >
            {repositories.error && !repositories.data && (
              <Message tone="danger" toneLabel="Error" live="assertive">
                Could not load repositories.
              </Message>
            )}
            <List label="Repositories" divided>
              {(repositories.data ?? []).map(repository => {
                const name = repository.name ?? repository.url;
                const managed = !repository.builtIn && repository.id !== 'local:user';
                return (
                  <ListItem
                    key={repository.id}
                    navId={managed ? `repository:${repository.id}` : undefined}
                    title={name}
                    metadata={repository.builtIn ? <Badge>built-in</Badge> : undefined}
                    description={
                      <span className={styles.facts}>
                        {managed && <span>{repository.url}</span>}
                        <span>
                          {repository.providerCount} provider
                          {repository.providerCount === 1 ? '' : 's'}
                          {repository.lastFetchedAt
                            ? ` · updated ${new Date(repository.lastFetchedAt).toLocaleString()}`
                            : ''}
                        </span>
                        {repository.lastError && <span>Problem: {repository.lastError}</span>}
                      </span>
                    }
                    trailing={
                      managed ? (
                        <>
                          <IconButton
                            navId={ADVANCED_NAV.refresh(repository.id)}
                            label={`Refresh ${name}`}
                            tooltip="Refresh"
                            icon={<RefreshIcon />}
                            onClick={() =>
                              void run(
                                () => refreshRepository(repository.id).unwrap(),
                                'Repository refreshed.',
                                'Could not refresh repository.'
                              )
                            }
                          />
                          <IconButton
                            navId={ADVANCED_NAV.remove(repository.id)}
                            label={`Remove ${name}`}
                            tooltip="Remove"
                            icon={<RemoveIcon />}
                            onClick={() =>
                              void run(
                                () => removeRepository(repository.id).unwrap(),
                                'Repository removed.',
                                'Could not remove repository.'
                              )
                            }
                          />
                        </>
                      ) : undefined
                    }
                  />
                );
              })}
            </List>
            <FormSection
              title="Add repository"
              titleHidden
              headingLevel={3}
              onSubmit={submit}
              busy={adding.isLoading}
              actions={
                <Button
                  type="submit"
                  navId={ADVANCED_NAV.repositoryAdd}
                  loading={adding.isLoading}
                  disabled={!url.trim()}
                >
                  Add repository
                </Button>
              }
            >
              <TextField
                navId={ADVANCED_NAV.repositoryUrl}
                id="repository-url"
                label="Repository URL"
                type="url"
                placeholder="https://example.com/providers.json"
                value={url}
                onChange={event => setUrl(event.target.value)}
              />
            </FormSection>
          </Section>
        </div>
      </Disclosure>
    </div>
  );
}
