import type { PlayerMedia } from '@features/player/lib/avplay-media';
import type { SubtitleCandidateDto } from '@miauflix/backend';
import {
  Badge,
  Button,
  List,
  ListItem,
  Popover,
  RadioGroup,
  type RadioOption,
  ScrollArea,
  Switch,
  Text,
} from '@shared/design-system';
import {
  INTERFACE_LANGUAGES,
  languageName,
  MEDIA_LANGUAGES,
  mediaLanguage,
  t as translate,
  useT,
} from '@shared/i18n';
import { useOptionalNavigation } from '@shared/navigation';
import { type RefObject, useEffect, useRef, useState } from 'react';

import { Part, SheetHeader, SheetLead, ViewHeading } from './PlayerSheet';
import * as styles from './playerSheet.css';
import { SubtitleTiming, type SubtitleTimingCue } from './SubtitleTiming';

import ChevronDownIcon from '~icons/mdi/chevron-down';
import ChevronRightIcon from '~icons/mdi/chevron-right';
import ChevronUpIcon from '~icons/mdi/chevron-up';
import CaptionsIcon from '~icons/mdi/closed-caption-outline';
import CloudIcon from '~icons/mdi/cloud-outline';
import HearingIcon from '~icons/mdi/ear-hearing';
import FilmIcon from '~icons/mdi/filmstrip';
import FolderIcon from '~icons/mdi/folder-outline';
import SourcesIcon from '~icons/mdi/layers-outline';
import SyncIcon from '~icons/mdi/swap-horizontal';
import LanguageIcon from '~icons/mdi/web';

/** Navigation IDs inside the panel. */
const NAV = {
  close: 'subtitle-close',
  back: 'subtitle-back',
  language: 'subtitle-language',
  moreLanguages: 'subtitle-more-languages',
  allLanguages: 'subtitle-all-languages',
  hearingImpaired: 'subtitle-hearing-impaired',
  embedded: 'subtitle-embedded',
  files: 'subtitle-files',
  online: 'subtitle-online',
  search: 'subtitle-search',
  onlineTracks: 'subtitle-online-tracks',
  tracks: 'subtitle-tracks',
  timing: 'subtitle-timing',
} as const;

/** The "no subtitles" choice (candidate IDs and language codes are never this). */
const OFF = '__off__';
/** Languages listed on the panel itself; the rest are behind More languages. */
const LISTED_LANGUAGES = 4;

/** A drill-in view, and the row on the main view that opens it (focused again on return). */
const VIEWS = {
  languages: NAV.moreLanguages,
  embedded: NAV.embedded,
  files: NAV.files,
  timing: NAV.timing,
} as const;
type View = keyof typeof VIEWS | 'main';

interface Preferences {
  language: string;
  hearingImpaired: boolean;
}

const isMediaLanguage = (value: string | null | undefined): value is string =>
  !!value && (MEDIA_LANGUAGES as readonly string[]).includes(value);

function readPreferences(key: string | null): Preferences {
  const browserLanguage =
    typeof navigator === 'undefined' ? 'en' : navigator.language.split('-')[0];
  const defaults = {
    language: isMediaLanguage(browserLanguage) ? browserLanguage : 'en',
    hearingImpaired: false,
  };
  if (!key || typeof window === 'undefined') return defaults;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(`miauflix.subtitle.${key}`) ?? 'null'
    ) as Partial<Preferences> | null;
    if (!stored) return defaults;
    return {
      language: isMediaLanguage(stored.language) ? stored.language : defaults.language,
      hearingImpaired: stored.hearingImpaired === true,
    };
  } catch {
    return defaults;
  }
}

function savePreferences(key: string | null, preferences: Preferences): void {
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`miauflix.subtitle.${key}`, JSON.stringify(preferences));
  } catch {
    // Browser storage may be unavailable; subtitle selection still works for this playback.
  }
}

/** A track as a choice: its language (and SDH), with the release it belongs to under it. */
function trackOption(candidate: SubtitleCandidateDto): RadioOption {
  return {
    value: candidate.id,
    label: [candidate.languageLabel, candidate.hearingImpaired ? translate('subtitles.sdh') : null]
      .filter(Boolean)
      .join(' · '),
    description: candidate.release && candidate.release !== 'root' ? candidate.release : undefined,
  };
}

/**
 * The languages offered on the panel: the profile's default first, the one showing, those with a
 * track at hand, then the interface languages and the rest, up to LISTED_LANGUAGES (more when more
 * have tracks).
 */
function listedLanguages(
  defaultLanguage: string,
  current: string | null,
  candidates: readonly SubtitleCandidateDto[]
): string[] {
  const listed = [
    ...new Set(
      [
        defaultLanguage,
        current,
        ...candidates.map(candidate => mediaLanguage(candidate.language)),
      ].filter(isMediaLanguage)
    ),
  ];
  for (const language of [...INTERFACE_LANGUAGES, ...MEDIA_LANGUAGES]) {
    if (listed.length >= LISTED_LANGUAGES) break;
    if (!listed.includes(language)) listed.push(language);
  }
  return listed;
}

/**
 * Closed captions: a Button in the player's controls row opening a modal side sheet over the
 * player (`container`), its full height. The main view picks the subtitle language (the
 * profile's default marked), hearing impaired, and where tracks come from (the video file, the
 * torrent's files, online), with the timing; each of those opens a view of its own. Back returns from a view to the main one, then closes the panel.
 */
export function SubtitleMenu({
  searchPreferences,
  videoRef,
  subtitleCues = [],
  pendingPosition,
  candidates,
  configured,
  available,
  loading,
  message,
  selectedId,
  offset,
  onSearch,
  onSelect,
  onShowLanguage,
  onOffsetChange,
  preferencesKey,
  defaultLanguage,
  container,
  navId,
  onOpenChange,
}: {
  /** The trigger's navigation ID in the player's controls row. */
  navId?: string;
  /** The panel opened or closed (the player keeps its controls up while it is open). */
  onOpenChange?: (open: boolean) => void;
  /** The player, which the sheet covers the end of (also in full screen). */
  container?: HTMLElement | null;
  searchPreferences?: { language: string; hearingImpaired: boolean };
  videoRef?: RefObject<PlayerMedia | null>;
  subtitleCues?: SubtitleTimingCue[];
  pendingPosition?: number;
  candidates: SubtitleCandidateDto[];
  configured: boolean | null;
  available: boolean | null;
  loading: boolean;
  message: string;
  selectedId: string | null;
  offset: number;
  onSearch: (language: string, hearingImpaired: boolean) => void;
  onSelect: (id: string | null) => void;
  /**
   * Shows subtitles in a language: a track of it at hand, else one searched for. Without it, a
   * language choice searches online.
   */
  onShowLanguage?: (language: string) => void;
  onOffsetChange: (offset: number) => void;
  preferencesKey: string | null;
  /** The profile's subtitle language for this title, marked Default (ISO 639-1). */
  defaultLanguage?: string;
}) {
  const t = useT();
  const navigation = useOptionalNavigation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('main');
  const [onlineOpen, setOnlineOpen] = useState(false);
  /** The language last chosen, shown as chosen while its track is looked for. */
  const [chosenLanguage, setChosenLanguage] = useState<string | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => {
    onOpenChangeRef.current?.(open);
    if (!open) setView('main');
  }, [open]);
  const [preferences, setPreferences] = useState(() => readPreferences(preferencesKey));
  const updatePreferences = (next: Preferences) => {
    setPreferences(next);
    savePreferences(preferencesKey, next);
  };

  useEffect(() => {
    setPreferences(readPreferences(preferencesKey));
  }, [preferencesKey]);

  useEffect(() => {
    if (searchPreferences) setPreferences(searchPreferences);
  }, [searchPreferences]);

  const embedded = candidates.filter(candidate => candidate.provider === 'embedded');
  const files = candidates.filter(candidate => candidate.provider === 'torrent');
  const embeddedCount = embedded.length;
  const filesCount = files.length;

  // Turning subtitles off leaves nothing to time
  useEffect(() => {
    if (!selectedId) setView(current => (current === 'timing' ? 'main' : current));
  }, [selectedId]);

  // A view opens on its choices (Back, when it has none); coming back from it lands on the row
  // that opened it
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    if (view !== 'main') {
      // Timing focuses its own adjustment
      const entry: Partial<Record<Exclude<View, 'main'>, string>> = {
        languages: NAV.allLanguages,
        embedded: embeddedCount ? NAV.tracks : NAV.back,
        files: filesCount ? NAV.tracks : NAV.back,
      };
      const target = entry[view];
      if (target) navigation?.focus(target);
      return;
    }
    if (!returnTo.current) return;
    navigation?.focus(returnTo.current);
    returnTo.current = null;
    // Only a change of view moves focus; the store's methods are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  const openView = (next: Exclude<View, 'main'>) => setView(next);
  const backToMain = () => {
    if (view !== 'main') returnTo.current = VIEWS[view];
    setView('main');
  };

  const selected = candidates.find(candidate => candidate.id === selectedId) ?? null;
  const showing = selected ? (mediaLanguage(selected.language) ?? null) : null;
  // A chosen language counts as chosen while its track is looked for
  const currentLanguage = showing ?? (loading ? chosenLanguage : null);
  const profileDefault = isMediaLanguage(defaultLanguage) ? defaultLanguage : preferences.language;
  const languages = listedLanguages(profileDefault, currentLanguage, candidates);
  const languageOption = (language: string): RadioOption => ({
    value: language,
    label: languageName(language),
    metadata: language === profileDefault ? <Badge>{t('subtitles.default')}</Badge> : undefined,
  });
  const chooseLanguage = (value: string) => {
    if (value === OFF) {
      setChosenLanguage(null);
      onSelect(null);
      return;
    }
    setChosenLanguage(value);
    updatePreferences({ ...preferences, language: value });
    if (onShowLanguage) onShowLanguage(value);
    else onSearch(value, preferences.hearingImpaired);
  };

  const online = candidates.filter(
    candidate => candidate.provider !== 'embedded' && candidate.provider !== 'torrent'
  );
  const trackChoice = (tracks: SubtitleCandidateDto[], groupNavId: string) => (
    <RadioGroup
      navId={groupNavId}
      appearance="rows"
      label={t('subtitles.tracks')}
      hideLabel
      options={[{ value: OFF, label: t('subtitles.off') }, ...tracks.map(trackOption)]}
      value={
        selectedId === null
          ? OFF
          : tracks.some(candidate => candidate.id === selectedId)
            ? selectedId
            : null
      }
      onChange={value => onSelect(value === OFF ? null : value)}
    />
  );

  const label = t('subtitles.subtitles');
  const offsetText = `${offset > 0 ? '+' : ''}${Number(offset.toFixed(2))}`;

  const viewTitles: Record<Exclude<View, 'main'>, string> = {
    languages: t('subtitles.moreLanguages'),
    embedded: t('subtitles.embedded'),
    files: t('subtitles.files'),
    timing: t('subtitles.timingTitle'),
  };

  const mainView = (
    <>
      <Part
        icon={<LanguageIcon />}
        title={t('subtitles.language')}
        description={t('subtitles.languageDescription')}
      >
        <RadioGroup
          navId={NAV.language}
          appearance="rows"
          label={t('subtitles.language')}
          hideLabel
          options={[{ value: OFF, label: t('subtitles.off') }, ...languages.map(languageOption)]}
          value={currentLanguage ?? (selected ? null : OFF)}
          onChange={chooseLanguage}
        />
        <List>
          <ListItem
            navId={NAV.moreLanguages}
            title={t('subtitles.moreLanguages')}
            metadata={<ChevronRightIcon aria-hidden="true" />}
            onClick={() => openView('languages')}
          />
        </List>
      </Part>
      <div className={styles.part}>
        <div className={styles.toggleRow}>
          <SheetLead icon={<HearingIcon />} />
          <span className={styles.toggle}>
            <Switch
              navId={NAV.hearingImpaired}
              label={t('subtitles.hearingImpaired')}
              description={t('subtitles.hearingImpairedDescription')}
              checked={preferences.hearingImpaired}
              onCheckedChange={checked =>
                updatePreferences({ ...preferences, hearingImpaired: checked })
              }
            />
          </span>
        </div>
      </div>
      <Part
        icon={<SourcesIcon />}
        title={t('subtitles.sources')}
        description={t('subtitles.sourcesDescription')}
      >
        <List>
          <ListItem
            navId={NAV.embedded}
            leading={<FilmIcon aria-hidden="true" />}
            title={t('subtitles.embedded')}
            description={t('subtitles.embeddedDescription', { count: embedded.length })}
            metadata={<ChevronRightIcon aria-hidden="true" />}
            onClick={() => openView('embedded')}
          />
          <ListItem
            navId={NAV.files}
            leading={<FolderIcon aria-hidden="true" />}
            title={t('subtitles.files')}
            description={t('subtitles.filesDescription', { count: files.length })}
            metadata={<ChevronRightIcon aria-hidden="true" />}
            onClick={() => openView('files')}
          />
          <ListItem
            navId={NAV.online}
            leading={<CloudIcon aria-hidden="true" />}
            title={t('subtitles.online')}
            description={t('subtitles.onlineDescription')}
            metadata={
              onlineOpen ? (
                <ChevronUpIcon aria-hidden="true" />
              ) : (
                <ChevronDownIcon aria-hidden="true" />
              )
            }
            onClick={() => setOnlineOpen(value => !value)}
          />
        </List>
        {onlineOpen && (
          <div className={styles.online}>
            <Button
              navId={NAV.search}
              loading={loading}
              onClick={() => onSearch(preferences.language, preferences.hearingImpaired)}
            >
              {loading
                ? t('subtitles.searching')
                : t('subtitles.searchIn', { language: languageName(preferences.language) })}
            </Button>
            {configured === false && <Text tone="secondary">{t('subtitles.notConfigured')}</Text>}
            {configured && available === false && (
              <Text tone="secondary">{t('subtitles.providerUnavailable')}</Text>
            )}
            {online.length > 0 && trackChoice(online, NAV.onlineTracks)}
          </div>
        )}
      </Part>
      <div className={styles.part}>
        <List>
          <ListItem
            navId={NAV.timing}
            leading={<SyncIcon aria-hidden="true" />}
            title={t('subtitles.synchronize')}
            description={t('subtitles.synchronizeDescription')}
            metadata={
              <>
                {selectedId && t('subtitles.offsetValue', { offset: offsetText })}
                <ChevronRightIcon aria-hidden="true" />
              </>
            }
            disabled={!selectedId}
            onClick={() => openView('timing')}
          />
        </List>
      </div>
    </>
  );

  const viewContent = (current: Exclude<View, 'main'>) => {
    switch (current) {
      case 'languages':
        return (
          <RadioGroup
            navId={NAV.allLanguages}
            appearance="rows"
            label={t('subtitles.language')}
            hideLabel
            options={[...MEDIA_LANGUAGES]
              .map(languageOption)
              .sort((left, right) => left.label.localeCompare(right.label, t('meta.locale')))}
            value={currentLanguage}
            onChange={value => {
              backToMain();
              chooseLanguage(value);
            }}
          />
        );
      case 'embedded':
        return embedded.length ? (
          trackChoice(embedded, NAV.tracks)
        ) : (
          <Text tone="secondary">{t('subtitles.noTracks')}</Text>
        );
      case 'files':
        return files.length ? (
          trackChoice(files, NAV.tracks)
        ) : (
          <Text tone="secondary">{t('subtitles.noTracks')}</Text>
        );
      case 'timing':
        return (
          <SubtitleTiming
            key={selectedId}
            cues={subtitleCues}
            videoRef={videoRef}
            pendingPosition={pendingPosition}
            offset={offset}
            onOffsetChange={onOffsetChange}
          />
        );
    }
  };

  return (
    <Popover
      open={open}
      onDismiss={() => (view === 'main' ? setOpen(false) : backToMain())}
      modality="modal"
      title={view === 'main' ? t('subtitles.panelTitle') : viewTitles[view]}
      hideTitle
      placement="sheet"
      container={container}
      initialNavId={NAV.language}
      align="end"
      size="lg"
      trigger={props => (
        <Button
          {...props}
          navId={navId}
          size="lg"
          selected={open}
          aria-label={label}
          onClick={() => setOpen(value => !value)}
        >
          {t('subtitles.trigger')}
        </Button>
      )}
    >
      <SheetHeader
        icon={<CaptionsIcon />}
        title={t('subtitles.panelTitle')}
        closeLabel={t('subtitles.close')}
        closeNavId={NAV.close}
        onClose={() => setOpen(false)}
      />
      <div className={styles.body}>
        <ScrollArea label={label}>
          {view === 'main' ? (
            mainView
          ) : (
            <>
              <ViewHeading
                title={viewTitles[view]}
                backLabel={t('subtitles.back')}
                backNavId={NAV.back}
                onBack={backToMain}
              />
              {viewContent(view)}
            </>
          )}
          {message && (
            <div className={styles.note}>
              <Text role="status" aria-live="polite">
                {message}
              </Text>
            </div>
          )}
        </ScrollArea>
      </div>
    </Popover>
  );
}
