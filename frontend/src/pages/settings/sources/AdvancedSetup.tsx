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
import { useT } from '@shared/i18n';
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
  const t = useT();
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
      t('sources.repositoryAdded'),
      t('sources.repositoryAddFailed')
    );
  };

  return (
    <div id="advanced-setup">
      <Disclosure
        navId={ADVANCED_NAV.toggle}
        title={t('sources.advanced')}
        description={t('sources.advancedDescription')}
        headingLevel={2}
        expanded={open}
        onExpandedChange={onOpenChange}
      >
        <SourcesAddProviders onNotice={onNotice} />
        <div className={styles.setupPart}>
          <Section
            title={t('sources.repositories')}
            headingLevel={3}
            description={t('sources.repositoriesDescription')}
          >
            {repositories.error && !repositories.data && (
              <Message tone="danger" toneLabel={t('common.error')} live="assertive">
                {t('sources.repositoriesFailed')}
              </Message>
            )}
            <List label={t('sources.repositories')} divided>
              {(repositories.data ?? []).map(repository => {
                const name = repository.name ?? repository.url;
                const managed = !repository.builtIn && repository.id !== 'local:user';
                return (
                  <ListItem
                    key={repository.id}
                    navId={managed ? `repository:${repository.id}` : undefined}
                    title={name}
                    metadata={
                      repository.builtIn ? <Badge>{t('sources.builtIn')}</Badge> : undefined
                    }
                    description={
                      <span className={styles.facts}>
                        {managed && <span>{repository.url}</span>}
                        <span>
                          {t('sources.providers', { count: repository.providerCount })}
                          {repository.lastFetchedAt
                            ? t('sources.updatedAt', {
                                date: new Date(repository.lastFetchedAt).toLocaleString(),
                              })
                            : ''}
                        </span>
                        {repository.lastError && (
                          <span>{t('sources.problem', { error: repository.lastError })}</span>
                        )}
                      </span>
                    }
                    trailing={
                      managed ? (
                        <>
                          <IconButton
                            navId={ADVANCED_NAV.refresh(repository.id)}
                            label={t('sources.refreshName', { name })}
                            tooltip={t('sources.refresh')}
                            icon={<RefreshIcon />}
                            onClick={() =>
                              void run(
                                () => refreshRepository(repository.id).unwrap(),
                                t('sources.repositoryRefreshed'),
                                t('sources.repositoryRefreshFailed')
                              )
                            }
                          />
                          <IconButton
                            navId={ADVANCED_NAV.remove(repository.id)}
                            label={t('sources.removeName', { name })}
                            tooltip={t('sources.remove')}
                            icon={<RemoveIcon />}
                            onClick={() =>
                              void run(
                                () => removeRepository(repository.id).unwrap(),
                                t('sources.repositoryRemoved'),
                                t('sources.repositoryRemoveFailed')
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
              title={t('sources.addRepository')}
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
                  {t('sources.addRepository')}
                </Button>
              }
            >
              <TextField
                navId={ADVANCED_NAV.repositoryUrl}
                id="repository-url"
                label={t('sources.repositoryUrl')}
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
