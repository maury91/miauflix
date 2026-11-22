import { audioLanguage } from '@features/player/lib/audio-language';
import type { PlayerMedia } from '@features/player/lib/avplay-media';
import type { CreatePlaybackSessionResponse, SubtitleCandidateDto } from '@miauflix/backend';
import {
  ActionGroup,
  Button,
  Disclosure,
  Popover,
  RadioGroup,
  type RadioOption,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
} from '@shared/design-system';
import { useT } from '@shared/i18n';
import { languageName, MEDIA_LANGUAGES, t as translate } from '@shared/i18n';
import { useOptionalNavigation } from '@shared/navigation';
import { type RefObject, useEffect, useRef, useState } from 'react';

import * as styles from './subtitleMenu.css';
import { SubtitleTiming, type SubtitleTimingCue } from './SubtitleTiming';

import ArrowLeftIcon from '~icons/mdi/arrow-left';

/** Navigation IDs inside the panel. */
const NAV = {
  audio: 'subtitle-audio',
  language: 'subtitle-language',
  hearingImpaired: 'subtitle-hearing-impaired',
  search: 'subtitle-search',
  tracks: 'subtitle-tracks',
  others: 'subtitle-other-languages',
  otherTracks: 'subtitle-other-tracks',
  timing: 'subtitle-timing',
  timingBack: 'subtitle-timing-back',
} as const;

/** The "no subtitles" choice among the tracks (candidate IDs are never this). */
const OFF = '__off__';

interface Preferences {
  language: string;
  hearingImpaired: boolean;
}

function readPreferences(key: string | null): Preferences {
  const browserLanguage =
    typeof navigator === 'undefined' ? 'en' : navigator.language.split('-')[0];
  const defaults = {
    language: (MEDIA_LANGUAGES as readonly string[]).includes(browserLanguage)
      ? browserLanguage
      : 'en',
    hearingImpaired: false,
  };
  if (!key || typeof window === 'undefined') return defaults;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(`miauflix.subtitle.${key}`) ?? 'null'
    ) as Partial<Preferences> | null;
    if (!stored) return defaults;
    return {
      language:
        typeof stored.language === 'string' &&
        (MEDIA_LANGUAGES as readonly string[]).includes(stored.language)
          ? stored.language
          : defaults.language,
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

function candidateLabel(candidate: SubtitleCandidateDto): string {
  return [
    candidate.languageLabel,
    candidate.provider === 'embedded'
      ? translate('subtitles.embedded')
      : candidate.provider === 'torrent'
        ? translate('subtitles.torrentFile')
        : translate('subtitles.online'),
    candidate.hearingImpaired ? translate('subtitles.sdh') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export type AudioTrack = NonNullable<
  NonNullable<CreatePlaybackSessionResponse['delivery']>['audioTracks']
>[number];

function audioLabel(track: AudioTrack) {
  const language =
    track.language && track.language !== 'und'
      ? languageName(track.language)
      : translate('subtitles.track', { number: track.index + 1 });
  return [
    language,
    track.title,
    track.codec?.toUpperCase(),
    track.channels ? translate('subtitles.channels', { count: track.channels }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Audio and subtitle choices: a design system Button in the player's controls row opening a modal
 * Popover above it. Inside, on the navigation layer: the audio track, the subtitle language,
 * hearing impaired, Find subtitles, the tracks (other languages behind a Disclosure) and the
 * timing. Back closes the panel, or the timing view first.
 */
export function SubtitleMenu({
  searchPreferences,
  videoRef,
  subtitleCues = [],
  pendingPosition,
  audioTracks,
  selectedAudioTrackIndex,
  onSelectAudioTrack,
  candidates,
  configured,
  available,
  loading,
  message,
  selectedId,
  offset,
  onSearch,
  onSelect,
  onOffsetChange,
  preferencesKey,
  navId,
  onOpenChange,
}: {
  /** The trigger's navigation ID in the player's controls row. */
  navId?: string;
  /** The panel opened or closed (the player keeps its controls up while it is open). */
  onOpenChange?: (open: boolean) => void;
  searchPreferences?: { language: string; hearingImpaired: boolean };
  videoRef?: RefObject<PlayerMedia | null>;
  subtitleCues?: SubtitleTimingCue[];
  pendingPosition?: number;
  audioTracks?: AudioTrack[];
  selectedAudioTrackIndex?: number;
  onSelectAudioTrack?: (index: number) => void;
  candidates: SubtitleCandidateDto[];
  configured: boolean | null;
  available: boolean | null;
  loading: boolean;
  message: string;
  selectedId: string | null;
  offset: number;
  onSearch: (language: string, hearingImpaired: boolean) => void;
  onSelect: (id: string | null) => void;
  onOffsetChange: (offset: number) => void;
  preferencesKey: string | null;
}) {
  const t = useT();
  const navigation = useOptionalNavigation();
  const [open, setOpen] = useState(false);
  const [timingOpen, setTimingOpen] = useState(false);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => {
    onOpenChangeRef.current?.(open);
  }, [open]);
  const [preferences, setPreferences] = useState(() => readPreferences(preferencesKey));
  const language = preferences.language;
  const hearingImpaired = preferences.hearingImpaired;
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

  useEffect(() => {
    setTimingOpen(false);
  }, [selectedId]);

  // Coming back from the timing view lands on the button that opened it
  const leftTiming = useRef(false);
  useEffect(() => {
    if (timingOpen || !leftTiming.current) return;
    leftTiming.current = false;
    navigation?.focus(NAV.timing);
    // The store's methods are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timingOpen]);
  const backToSettings = () => {
    leftTiming.current = true;
    setTimingOpen(false);
  };

  const [otherLanguages, setOtherLanguages] = useState(false);
  const preferred = candidates
    .filter(candidate => audioLanguage(candidate.language) === audioLanguage(language))
    .sort((a, b) => Number(a.provider !== 'torrent') - Number(b.provider !== 'torrent'));
  const others = candidates.filter(
    candidate => audioLanguage(candidate.language) !== audioLanguage(language)
  );
  const trackOption = (candidate: SubtitleCandidateDto): RadioOption => ({
    value: candidate.id,
    label: candidateLabel(candidate),
    description: candidate.release && candidate.release !== 'root' ? candidate.release : undefined,
  });
  const withAudio = Boolean(audioTracks && audioTracks.length > 1 && onSelectAudioTrack);
  const label = withAudio ? t('subtitles.audioAndSubtitles') : t('subtitles.subtitles');

  return (
    <Popover
      open={open}
      onDismiss={() => (timingOpen && selectedId ? backToSettings() : setOpen(false))}
      modality="modal"
      title={timingOpen && selectedId ? t('subtitles.timingTitle') : t('subtitles.settingsTitle')}
      hideTitle
      placement="top"
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
          {withAudio ? t('subtitles.triggerWithAudio') : t('subtitles.trigger')}
        </Button>
      )}
    >
      <div className={styles.body}>
        <ScrollArea label={label}>
          {timingOpen && selectedId ? (
            <Stack gap="md">
              <ActionGroup>
                <Button navId={NAV.timingBack} icon={<ArrowLeftIcon />} onClick={backToSettings}>
                  {t('subtitles.backToSettings')}
                </Button>
              </ActionGroup>
              <SubtitleTiming
                key={selectedId}
                cues={subtitleCues}
                videoRef={videoRef}
                pendingPosition={pendingPosition}
                offset={offset}
                onOffsetChange={onOffsetChange}
              />
            </Stack>
          ) : (
            <Stack gap="md">
              {withAudio && audioTracks && onSelectAudioTrack && (
                <RadioGroup
                  navId={NAV.audio}
                  label={t('subtitles.audio')}
                  options={audioTracks.map(track => ({
                    value: String(track.index),
                    label: audioLabel(track),
                  }))}
                  value={
                    selectedAudioTrackIndex === undefined ? null : String(selectedAudioTrackIndex)
                  }
                  onChange={value => onSelectAudioTrack(Number(value))}
                />
              )}
              <Select
                navId={NAV.language}
                label={t('subtitles.language')}
                items={MEDIA_LANGUAGES.map(value => ({ value, label: languageName(value) }))}
                value={language}
                onChange={value => updatePreferences({ ...preferences, language: value })}
                fullWidth
              />
              <Switch
                navId={NAV.hearingImpaired}
                label={t('subtitles.hearingImpaired')}
                checked={hearingImpaired}
                onCheckedChange={checked =>
                  updatePreferences({ ...preferences, hearingImpaired: checked })
                }
              />
              <ActionGroup>
                <Button
                  navId={NAV.search}
                  loading={loading}
                  onClick={() => onSearch(language, hearingImpaired)}
                >
                  {loading ? t('subtitles.searching') : t('subtitles.find')}
                </Button>
              </ActionGroup>
              <RadioGroup
                navId={NAV.tracks}
                label={t('subtitles.tracks')}
                options={[{ value: OFF, label: t('subtitles.off') }, ...preferred.map(trackOption)]}
                value={
                  selectedId === null
                    ? OFF
                    : preferred.some(candidate => candidate.id === selectedId)
                      ? selectedId
                      : null
                }
                onChange={value => onSelect(value === OFF ? null : value)}
              />
              {others.length > 0 && (
                <Disclosure
                  navId={NAV.others}
                  title={t('subtitles.otherLanguagesCount', { count: others.length })}
                  expanded={otherLanguages}
                  onExpandedChange={setOtherLanguages}
                >
                  <RadioGroup
                    navId={NAV.otherTracks}
                    label={t('subtitles.otherLanguages')}
                    options={others.map(trackOption)}
                    value={
                      others.some(candidate => candidate.id === selectedId) ? selectedId : null
                    }
                    onChange={onSelect}
                  />
                </Disclosure>
              )}
              {selectedId && (
                <ActionGroup>
                  <Button navId={NAV.timing} onClick={() => setTimingOpen(true)}>
                    {t('subtitles.adjustTiming', {
                      offset: `${offset > 0 ? '+' : ''}${Number(offset.toFixed(2))}`,
                    })}
                  </Button>
                </ActionGroup>
              )}
            </Stack>
          )}
          {message && (
            <Text role="status" aria-live="polite">
              {message}
            </Text>
          )}
          {configured === false && <Text tone="secondary">{t('subtitles.notConfigured')}</Text>}
          {configured && available === false && (
            <Text tone="secondary">{t('subtitles.providerUnavailable')}</Text>
          )}
        </ScrollArea>
      </div>
    </Popover>
  );
}
