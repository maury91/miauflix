import {
  useGetProvidersQuery,
  useRemoveProviderMutation,
  useReorderProvidersMutation,
  useTestProviderMutation,
  useUpdateProviderMutation,
} from '@features/sources/api/sources.api';
import type { ProviderView } from '@miauflix/backend';
import { SETTINGS_PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { Button } from '@shared/ui';
import { BackRail } from '@shared/ui/rail/BackRail';
import { useRailContentLeft } from '@shared/ui/rail/useRailContentLeft';
import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import { AdvancedSetup } from './sources/AdvancedSetup';
import { errorMessage } from './sources/errors';
import { HowItWorks } from './sources/HowItWorks';
import { ProviderRow } from './sources/ProviderRow';
import { ProviderSettingsForm } from './sources/ProviderSettingsForm';
import { Content, IconBox, Message, Muted, Page, Panel, Pill, TopBackdrop } from './sources/styles';

import InfoIcon from '~icons/mdi/information-outline';
import LayersIcon from '~icons/mdi/layers-outline';
import AddIcon from '~icons/mdi/plus';

const Header = styled.header`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 32px;
  font-weight: 600;
  line-height: 1.15;
  text-transform: none;
`;

const Subtitle = styled.p`
  margin: 2px 0 0;
  color: ${SETTINGS_PALETTE.text.secondary};
  font-size: 15px;
`;

const SectionBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  text-transform: none;
`;

const AddButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding: 10px 20px;
  border: 0;
  border-radius: 8px;
  background: ${SETTINGS_PALETTE.color.danger};
  color: #fff;
  font:
    600 15px 'Poppins',
    sans-serif;
  cursor: pointer;

  &:hover {
    background: #ef2a33;
  }
  &:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 3px;
  }
`;

const List = styled.ul`
  margin: 0;
  padding: 0;
`;

const Hint = styled(Muted)`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px 4px 28px;
  font-size: 14px;
`;

const Gap = styled.div`
  height: 8px;
`;

interface SourcesPageProps {
  onDismiss: () => void;
}

export default function SourcesPage({ onDismiss }: SourcesPageProps) {
  useRailContentLeft();
  const providers = useGetProvidersQuery(undefined, { pollingInterval: 10_000 });
  const [updateProvider, updating] = useUpdateProviderMutation();
  const [reorder, reordering] = useReorderProvidersMutation();
  const [testProvider] = useTestProviderMutation();
  const [removeProvider] = useRemoveProviderMutation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [armed, setArmed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const pageRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    backRef.current?.focus({ preventScroll: true });
  }, []);

  const focusables = () =>
    Array.from(
      pageRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled)'
      ) ?? []
    ).filter(item => item !== backRef.current);
  const cycle = (direction: -1 | 1) => {
    const items = [backRef.current, ...focusables()].filter((item): item is HTMLElement => !!item);
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + direction + items.length) % items.length]?.focus({ preventScroll: true });
    return true;
  };
  const navigationRef = useKeyboardNavigation({
    onUp: () => cycle(-1),
    onDown: () => cycle(1),
    onLeft: () => {
      backRef.current?.focus({ preventScroll: true });
      return true;
    },
    onRight: () => {
      if (document.activeElement === backRef.current)
        focusables()[0]?.focus({ preventScroll: true });
      return true;
    },
    onBack: () => {
      if (menu) setMenu(null);
      else onDismiss();
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
  const enabledCount = ordered.filter(provider => provider.enabled).length;
  const busy = updating.isLoading || reordering.isLoading;

  const reorderTo = (ids: string[], name: string) =>
    void run(() => reorder(ids).unwrap(), `Moved ${name}.`, `Could not move ${name}.`);
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
    reorderTo(ids, ordered.find(item => item.id === source)?.name ?? 'source');
  };
  const test = async (provider: ProviderView) => {
    setNotice('');
    setError('');
    try {
      const result = await testProvider(provider.id).unwrap();
      if (result.success) setNotice(`${provider.name}: ${result.message}`);
      else setError(`${provider.name}: ${result.message}`);
    } catch (requestError) {
      setError(errorMessage(requestError, `Could not test ${provider.name}.`));
    }
  };
  const openAdvanced = () => {
    setAdvancedOpen(true);
    requestAnimationFrame(() =>
      document.getElementById('advanced-setup')?.scrollIntoView?.({ behavior: 'smooth' })
    );
  };

  return (
    <Page
      ref={node => {
        pageRef.current = node;
        navigationRef(node);
      }}
      aria-labelledby="sources-title"
    >
      <TopBackdrop />
      <Content>
        <Header>
          <IconBox $size={56} aria-hidden="true">
            <LayersIcon />
          </IconBox>
          <div>
            <Title id="sources-title">Sources</Title>
            <Subtitle>
              Miauflix uses sources to find available files for movies and TV shows.
            </Subtitle>
          </div>
        </Header>

        <HowItWorks />

        <SectionBar>
          <SectionTitle>Sources</SectionTitle>
          {providers.data && (
            <Pill>
              {ordered.length} provider{ordered.length === 1 ? '' : 's'} · {enabledCount} enabled
            </Pill>
          )}
          <AddButton type="button" onClick={openAdvanced}>
            <AddIcon aria-hidden="true" /> Add source
          </AddButton>
        </SectionBar>

        <div role="status" aria-live="polite">
          {notice && <Message>{notice}</Message>}
        </div>
        {error && <Message role="alert">{error}</Message>}
        {providers.isLoading && <Message role="status">Loading sources…</Message>}
        {!providers.isLoading && providers.error && !providers.data && (
          <>
            <Message role="alert">Could not load sources.</Message>
            <Button
              appearance="settings"
              color="secondary"
              onClick={() => void providers.refetch()}
            >
              Try again
            </Button>
          </>
        )}

        {ordered.length > 0 && (
          <Panel as="div">
            <List aria-label="Sources">
              {ordered.map((provider, index) => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  index={index}
                  count={ordered.length}
                  busy={busy}
                  menuOpen={menu === provider.id}
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
                      `${provider.name} ${enabled ? 'enabled' : 'disabled'}.`,
                      `Could not update ${provider.name}.`
                    )
                  }
                  onTest={() => void test(provider)}
                  onMenu={open => setMenu(open ? provider.id : null)}
                  onSettings={() => setExpanded(expanded === provider.id ? null : provider.id)}
                  onMove={offset => move(provider, offset)}
                  onRemove={
                    provider.repositoryId === 'local:user'
                      ? () =>
                          void run(
                            () => removeProvider(provider.id).unwrap(),
                            `Removed ${provider.name}.`,
                            `Could not remove ${provider.name}.`
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
            </List>
          </Panel>
        )}
        <Hint>
          <InfoIcon aria-hidden="true" />
          Sources are searched from top to bottom. Change their order to set which sources Miauflix
          checks first.
        </Hint>

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
        <Gap />
      </Content>
      <BackRail ref={backRef} label="Back to Settings" onBack={onDismiss} />
    </Page>
  );
}
