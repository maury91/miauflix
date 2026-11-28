import { useGetProvidersQuery, useUpdateProviderMutation } from '@features/sources/api/sources.api';
import type { ProviderView } from '@miauwatch/backend';
import { SettingsLayout } from '@pages/settings/SettingsLayout';
import { describeProvider } from '@pages/settings/sources/descriptions';
import { errorMessage } from '@pages/settings/sources/errors';
import { ADD_SOURCE_NAV } from '@pages/settings/sources/navIds';
import * as sourceStyles from '@pages/settings/sources/sources.css';
import { IndexerCatalog, StremioAddonForm, TorznabForm } from '@pages/settings/SourcesAddProviders';
import { builtForTizen } from '@shared/config/constants';
import {
  ActionGroup,
  Button,
  IconButton,
  Link,
  ListItem,
  Message,
  ProgressSpinner,
  Section,
  Stack,
  Switch,
  Text,
} from '@shared/design-system';
import { type MessageKey, useT } from '@shared/i18n';
import { FocusGroup } from '@shared/navigation';
import { type ReactNode, useId, useState } from 'react';

import * as styles from './sourcesSetup.css';
import { type SourceKind, SOURCES_SETUP_NAV } from './sourcesSetupNav';

import ChevronRightIcon from '~icons/mdi/chevron-right';
import InfoIcon from '~icons/mdi/information-outline';
import SearchIcon from '~icons/mdi/magnify';
import AddonIcon from '~icons/mdi/puzzle-outline';
import ServerIcon from '~icons/mdi/server-outline';

const KINDS: SourceKind[] = ['stremio', 'torznab', 'catalog'];

const ICONS: Record<SourceKind, ReactNode> = {
  stremio: <AddonIcon />,
  torznab: <ServerIcon />,
  catalog: <SearchIcon />,
};

const TEXT: Record<
  SourceKind,
  {
    title: MessageKey;
    summary: MessageKey;
    info: MessageKey;
    intro: MessageKey;
    steps: MessageKey[];
  }
> = {
  stremio: {
    title: 'config.sources.stremio.title',
    summary: 'config.sources.stremio.summary',
    info: 'config.sources.stremio.info',
    intro: 'config.sources.stremio.intro',
    steps: [
      'config.sources.stremio.step1',
      'config.sources.stremio.step2',
      'config.sources.stremio.step3',
    ],
  },
  torznab: {
    title: 'config.sources.torznab.title',
    summary: 'config.sources.torznab.summary',
    info: 'config.sources.torznab.info',
    intro: 'config.sources.torznab.intro',
    steps: [
      'config.sources.torznab.step1',
      'config.sources.torznab.step2',
      'config.sources.torznab.step3',
    ],
  },
  catalog: {
    title: 'config.sources.catalog.title',
    summary: 'config.sources.catalog.summary',
    info: 'config.sources.catalog.info',
    intro: 'config.sources.catalog.intro',
    steps: [],
  },
};

const NAV = SOURCES_SETUP_NAV;

/**
 * Where to find Stremio addons. Left out of the TV build: a link there would leave the app for a
 * page the remote can't use.
 */
const COMMUNITY_ADDONS_URL = 'https://stremio-addons.net/addons?categories=torrents&sort=popular';
const BROWSE: Partial<Record<SourceKind, string>> = builtForTizen
  ? {}
  : { stremio: COMMUNITY_ADDONS_URL };

/** A link to where sources of this kind are listed, when there is one. */
function BrowseLink({ kind, navId }: { kind: SourceKind; navId: string }) {
  const t = useT();
  const href = BROWSE[kind];
  if (!href) return null;
  return (
    <Link navId={navId} href={href} variant="standalone" external>
      {t('config.sources.stremio.browse')}
    </Link>
  );
}

/** Each page opens on its first field. */
const FIRST_FIELD: Record<SourceKind, string> = {
  stremio: ADD_SOURCE_NAV.stremioUrl,
  torznab: ADD_SOURCE_NAV.torznabName,
  catalog: ADD_SOURCE_NAV.search,
};

interface SourcesSetupProps {
  /** Above the options on the main page: the wizard's step timeline. */
  header?: ReactNode;
  /** Under the options on the main page: Next, Set up later or Continue. */
  actions: (state: { enabledCount: number }) => ReactNode;
  /** Focused when the main page first opens; the first option otherwise. */
  initialNavId?: string;
  /** On the main page, rendered inside its navigation (the wizard's step focus). */
  children?: ReactNode;
}

/**
 * Adding sources during setup: a page that lists the ways to add one (each with what it is), the
 * sources added so far with a switch each, and a page per way, reached from its card and left with
 * Back. A source added here is switched on at once: adding it is the admin's choice to search it.
 */
export function SourcesSetup({ header, actions, initialNavId, children }: SourcesSetupProps) {
  const t = useT();
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [returnTo, setReturnTo] = useState<string | undefined>(initialNavId);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  // Fetched afresh: the sources service may only have started with the settings just saved
  const providers = useGetProvidersQuery(undefined, { refetchOnMountOrArgChange: true });
  const [updateProvider] = useUpdateProviderMutation();
  const enabledCount = (providers.data ?? []).filter(provider => provider.enabled).length;

  const open = (next: SourceKind) => {
    setNotice('');
    setError('');
    setKind(next);
  };
  const back = () => {
    if (kind) setReturnTo(NAV.option(kind));
    setKind(null);
  };

  /** Turns a just-added source on; a form's page then returns to the list with the outcome. */
  const added = async (view: ProviderView, leave: boolean) => {
    setError('');
    try {
      await updateProvider({ id: view.id, enabled: true }).unwrap();
      setNotice(t('config.sources.addedOn', { name: view.name }));
    } catch (requestError) {
      setNotice('');
      setError(
        t('config.sources.addedOff', {
          name: view.name,
          error: errorMessage(requestError, t('sources.updateFailed', { name: view.name })),
        })
      );
    }
    if (leave) back();
  };

  const messages = (
    <>
      <div role="status" aria-live="polite">
        {notice && <Message tone="success">{notice}</Message>}
      </div>
      {error && (
        <Message tone="danger" toneLabel={t('common.error')} live="assertive">
          {error}
        </Message>
      )}
    </>
  );

  if (kind) {
    const text = TEXT[kind];
    return (
      <SettingsLayout
        key={kind}
        staticLogo
        title={t(text.title)}
        description={t(text.intro)}
        onBack={back}
        backLabel={t('config.sources.back')}
        initialNavId={FIRST_FIELD[kind]}
      >
        <Stack gap="lg">
          {text.steps.length > 0 && (
            <ol className={styles.steps}>
              {text.steps.map(step => (
                <li key={step}>
                  <Text tone="secondary">{t(step)}</Text>
                </li>
              ))}
            </ol>
          )}
          <BrowseLink kind={kind} navId={NAV.browse} />
          {messages}
          {kind === 'stremio' && (
            <StremioAddonForm
              title={t(text.title)}
              titleHidden
              onAdded={view => void added(view, true)}
            />
          )}
          {kind === 'torznab' && (
            <TorznabForm
              title={t(text.title)}
              titleHidden
              onAdded={view => void added(view, true)}
            />
          )}
          {/* Several indexers can be added in a row: the page stays open */}
          {kind === 'catalog' && (
            <IndexerCatalog entryHeadingLevel={2} onAdded={view => void added(view, false)} />
          )}
        </Stack>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout
      key="options"
      staticLogo
      title={t('config.sources.title')}
      description={t('config.sources.description')}
      initialNavId={returnTo ?? NAV.option(KINDS[0])}
    >
      {children}
      <Stack gap="lg">
        {header}
        {messages}
        <YourSources providers={providers} />
        {/* Under Your sources, the options need a heading of their own */}
        <Section
          title={t('config.sources.addAnother')}
          titleHidden={!providers.data?.length}
          headingLevel={2}
        >
          <FocusGroup id={NAV.options} layout="vertical">
            <ul className={styles.options} aria-label={t('config.sources.options')}>
              {KINDS.map(option => (
                <li key={option} className={styles.optionItem}>
                  <SourceOption kind={option} onOpen={() => open(option)} />
                </li>
              ))}
            </ul>
          </FocusGroup>
        </Section>
        {actions({ enabledCount })}
      </Stack>
    </SettingsLayout>
  );
}

/** One way to add a source: a card that opens its page, and a button that says what it is. */
function SourceOption({ kind, onOpen }: { kind: SourceKind; onOpen: () => void }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const infoId = useId();
  const text = TEXT[kind];
  const title = t(text.title);
  return (
    <>
      <FocusGroup
        id={`${NAV.option(kind)}:row`}
        layout="horizontal"
        entry="first"
        defaultId={NAV.option(kind)}
      >
        <div className={styles.option}>
          <div className={styles.card}>
            <ListItem
              navId={NAV.option(kind)}
              leading={<span className={styles.optionIcon}>{ICONS[kind]}</span>}
              title={title}
              description={t(text.summary)}
              metadata={
                <span className={styles.chevron} aria-hidden="true">
                  <ChevronRightIcon />
                </span>
              }
              onClick={onOpen}
            />
          </div>
          <div className={styles.infoButton}>
            <IconButton
              navId={NAV.info(kind)}
              label={t('config.sources.about', { name: title })}
              icon={<InfoIcon />}
              aria-expanded={expanded}
              aria-controls={infoId}
              onClick={() => setExpanded(!expanded)}
            />
          </div>
        </div>
      </FocusGroup>
      <div id={infoId} className={styles.info} hidden={!expanded}>
        <Text>{t(text.info)}</Text>
        {/* Only reachable while shown */}
        {expanded && <BrowseLink kind={kind} navId={NAV.infoBrowse(kind)} />}
      </div>
    </>
  );
}

/** The sources added so far, each with a switch; nothing until there is one. */
interface ProvidersState {
  data?: ProviderView[];
  isLoading: boolean;
  error?: unknown;
  refetch: () => unknown;
}

function YourSources({ providers }: { providers: ProvidersState }) {
  const t = useT();
  const [updateProvider] = useUpdateProviderMutation();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');

  const ordered = [...(providers.data ?? [])].sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id)
  );
  const enabledCount = ordered.filter(provider => provider.enabled).length;

  const toggle = async (id: string, name: string, enabled: boolean) => {
    setError('');
    setPending(id);
    try {
      await updateProvider({ id, enabled }).unwrap();
    } catch (requestError) {
      setError(errorMessage(requestError, t('sources.updateFailed', { name })));
    } finally {
      setPending(null);
    }
  };

  if (providers.isLoading) return <ProgressSpinner label={t('sources.loading')} />;
  if (providers.error && !providers.data)
    return (
      <Message
        tone="danger"
        toneLabel={t('common.error')}
        live="assertive"
        actions={
          <ActionGroup>
            <Button navId={NAV.retry} onClick={() => void providers.refetch()}>
              {t('sources.tryAgain')}
            </Button>
          </ActionGroup>
        }
      >
        {t('config.sources.loadFailed')}
      </Message>
    );
  if (ordered.length === 0) return null;
  return (
    <Section title={t('config.sources.yours')} headingLevel={2}>
      <Stack gap="sm">
        {error && (
          <Message tone="danger" toneLabel={t('common.error')} live="assertive">
            {error}
          </Message>
        )}
        <FocusGroup id={NAV.list} layout="vertical">
          <ul className={sourceStyles.providers} aria-label={t('config.sources.yours')}>
            {ordered.map(provider => (
              <li key={provider.id} className={sourceStyles.row}>
                <div className={sourceStyles.rowMain}>
                  <Switch
                    navId={NAV.source(provider.id)}
                    label={provider.name}
                    description={describeProvider(provider)}
                    checked={provider.enabled}
                    disabled={pending !== null}
                    onCheckedChange={enabled => void toggle(provider.id, provider.name, enabled)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </FocusGroup>
        <Text variant="caption" tone="secondary" role="status">
          {enabledCount === 0
            ? t('config.sources.noneEnabled')
            : t('config.sources.enabledCount', { count: enabledCount })}
        </Text>
      </Stack>
    </Section>
  );
}
