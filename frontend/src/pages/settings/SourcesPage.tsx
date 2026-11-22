import {
  useGetProvidersQuery,
  useRemoveProviderMutation,
  useReorderProvidersMutation,
  useTestProviderMutation,
  useUpdateProviderMutation,
} from '@features/sources/api/sources.api';
import type { ProviderView } from '@miauflix/backend';
import {
  ActionGroup,
  Badge,
  Button,
  Heading,
  Message,
  ProgressSpinner,
  Text,
} from '@shared/design-system';
import { useT } from '@shared/i18n';
import { useOptionalNavigation } from '@shared/navigation';
import { useEffect, useState } from 'react';

import { AdvancedSetup } from './sources/AdvancedSetup';
import { errorMessage } from './sources/errors';
import { HowItWorks } from './sources/HowItWorks';
import { ADVANCED_NAV } from './sources/navIds';
import { ProviderRow } from './sources/ProviderRow';
import { ProviderSettingsForm } from './sources/ProviderSettingsForm';
import * as styles from './sources/sources.css';
import { SettingsLayout } from './SettingsLayout';

import InfoIcon from '~icons/mdi/information-outline';
import AddIcon from '~icons/mdi/plus';

const SOURCES_NAV = {
  add: 'sources-add',
  retry: 'sources-retry',
} as const;

interface SourcesPageProps {
  onDismiss: () => void;
}

/** Brings Advanced setup into focus and view once Add source opened it. */
function RevealAdvanced({ request }: { request: number }) {
  const navigation = useOptionalNavigation();
  useEffect(() => {
    if (!request) return;
    navigation?.focus(ADVANCED_NAV.toggle);
    document.getElementById('advanced-setup')?.scrollIntoView?.({ behavior: 'smooth' });
    // Each request once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);
  return null;
}

/**
 * Which sources Miauwatch searches, in which order, and how to add more. On the navigation layer:
 * each source is a row (switch, Test, options), and Advanced setup holds the catalog and forms.
 */
export default function SourcesPage({ onDismiss }: SourcesPageProps) {
  const t = useT();
  const providers = useGetProvidersQuery(undefined, { pollingInterval: 10_000 });
  const [updateProvider, updating] = useUpdateProviderMutation();
  const [reorder, reordering] = useReorderProvidersMutation();
  const [testProvider] = useTestProviderMutation();
  const [removeProvider] = useRemoveProviderMutation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [revealRequest, setRevealRequest] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

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
  const enabledCount = ordered.filter(provider => provider.enabled).length;
  const busy = updating.isLoading || reordering.isLoading;

  const reorderTo = (ids: string[], name: string) =>
    void run(
      () => reorder(ids).unwrap(),
      t('sources.moved', { name }),
      t('sources.moveFailed', { name })
    );
  const move = (provider: ProviderView, offset: -1 | 1) => {
    const ids = ordered.map(item => item.id);
    const from = ids.indexOf(provider.id);
    const to = from + offset;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    reorderTo(ids, provider.name);
  };
  const drop = (targetId: string) => {
    const source = dragging;
    setDragging(null);
    setOver(null);
    setArmed(null);
    if (!source || source === targetId) return;
    const ids = ordered.map(item => item.id);
    const from = ids.indexOf(source);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, source);
    reorderTo(ids, ordered.find(item => item.id === source)?.name ?? t('sources.source'));
  };
  const test = async (provider: ProviderView) => {
    setNotice('');
    setError('');
    setTesting(provider.id);
    try {
      const result = await testProvider(provider.id).unwrap();
      if (result.success) setNotice(`${provider.name}: ${result.message}`);
      else setError(`${provider.name}: ${result.message}`);
    } catch (requestError) {
      setError(errorMessage(requestError, t('sources.testFailed', { name: provider.name })));
    } finally {
      setTesting(null);
    }
  };
  const openAdvanced = () => {
    setAdvancedOpen(true);
    setRevealRequest(request => request + 1);
  };

  return (
    <SettingsLayout
      title={t('sources.title')}
      description={t('sources.description')}
      onBack={onDismiss}
      backLabel={t('common.backToHome')}
      width="full"
    >
      <RevealAdvanced request={revealRequest} />
      <HowItWorks />

      <section className={styles.block} aria-labelledby="sources-list-title">
        <div className={styles.sectionBar}>
          <Heading level={2} id="sources-list-title">
            {t('sources.title')}
          </Heading>
          {providers.data && (
            <Badge>{t('sources.count', { count: ordered.length, enabled: enabledCount })}</Badge>
          )}
          <ActionGroup>
            <Button navId={SOURCES_NAV.add} icon={<AddIcon />} onClick={openAdvanced}>
              {t('sources.add')}
            </Button>
          </ActionGroup>
        </div>

        <div role="status" aria-live="polite">
          {notice && <Message tone="success">{notice}</Message>}
        </div>
        {error && (
          <Message tone="danger" toneLabel={t('common.error')} live="assertive">
            {error}
          </Message>
        )}
        {providers.isLoading && <ProgressSpinner label={t('sources.loading')} />}
        {!providers.isLoading && providers.error && !providers.data && (
          <Message
            tone="danger"
            toneLabel={t('common.error')}
            live="assertive"
            actions={
              <ActionGroup>
                <Button navId={SOURCES_NAV.retry} onClick={() => void providers.refetch()}>
                  {t('sources.tryAgain')}
                </Button>
              </ActionGroup>
            }
          >
            {t('sources.loadFailed')}
          </Message>
        )}

        {ordered.length > 0 && (
          <ul className={styles.providers} aria-label={t('sources.title')}>
            {ordered.map((provider, index) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                index={index}
                count={ordered.length}
                busy={busy}
                testing={testing === provider.id}
                armed={armed === provider.id}
                dragging={dragging === provider.id}
                dragOver={over === provider.id && dragging !== provider.id}
                onArm={isArmed => setArmed(isArmed ? provider.id : null)}
                onDragStart={event => {
                  event.dataTransfer?.setData('text/plain', provider.id);
                  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
                  setDragging(provider.id);
                }}
                onDragEnter={() => setOver(provider.id)}
                onDrop={() => drop(provider.id)}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                  setArmed(null);
                }}
                onToggle={enabled =>
                  void run(
                    () => updateProvider({ id: provider.id, enabled }).unwrap(),
                    t(enabled ? 'sources.enabled' : 'sources.disabled', { name: provider.name }),
                    t('sources.updateFailed', { name: provider.name })
                  )
                }
                onTest={() => void test(provider)}
                onSettings={() => setExpanded(expanded === provider.id ? null : provider.id)}
                onMove={offset => move(provider, offset)}
                onRemove={
                  provider.repositoryId === 'local:user'
                    ? () =>
                        void run(
                          () => removeProvider(provider.id).unwrap(),
                          t('sources.removedName', { name: provider.name }),
                          t('sources.removeFailed', { name: provider.name })
                        )
                    : undefined
                }
                detail={
                  expanded === provider.id && (
                    <ProviderSettingsForm
                      provider={provider}
                      onSaved={message => {
                        setNotice(message);
                        setExpanded(null);
                      }}
                    />
                  )
                }
              />
            ))}
          </ul>
        )}
        <p className={styles.hint}>
          <InfoIcon aria-hidden="true" />
          <Text as="span" variant="caption" tone="secondary">
            {t('sources.order')}
          </Text>
        </p>
      </section>

      <div className={styles.block}>
        <AdvancedSetup
          open={advancedOpen}
          onOpenChange={setAdvancedOpen}
          onNotice={message => {
            setError('');
            setNotice(message);
          }}
          onError={message => {
            setNotice('');
            setError(message);
          }}
        />
      </div>
    </SettingsLayout>
  );
}
