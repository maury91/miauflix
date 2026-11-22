import type {
  AudioSourceDto,
  AudioSourceTrack,
  CreatePlaybackSessionResponse,
} from '@miauflix/backend';
import {
  Badge,
  Button,
  IconButton,
  List,
  ListItem,
  Popover,
  RadioGroup,
  type RadioOption,
  ScrollArea,
  Select,
  type SelectItems,
  Text,
} from '@shared/design-system';
import { languageName, MEDIA_LANGUAGES, mediaLanguage, t as translate, useT } from '@shared/i18n';
import { qualityLabel, sourceLabel } from '@shared/lib/source-quality';
import { useEffect, useRef, useState } from 'react';

import { Part, SheetHeader } from './PlayerSheet';
import * as styles from './playerSheet.css';

import ChevronDownIcon from '~icons/mdi/chevron-down';
import ChevronUpIcon from '~icons/mdi/chevron-up';
import CloudIcon from '~icons/mdi/cloud-outline';
import HeadphonesIcon from '~icons/mdi/headphones';
import SearchIcon from '~icons/mdi/magnify';
import PlayIcon from '~icons/mdi/play';
import LanguageIcon from '~icons/mdi/web';

export type AudioTrack = NonNullable<
  NonNullable<CreatePlaybackSessionResponse['delivery']>['audioTracks']
>[number];

/** Navigation IDs inside the panel. */
const NAV = {
  close: 'audio-close',
  tracks: 'audio-tracks',
  moreTracks: 'audio-more-tracks',
  searchLanguage: 'audio-search-language',
  search: 'audio-search',
  sources: 'audio-sources',
  source: (id: number) => `audio-source-${id}`,
} as const;

/** Tracks listed before More languages. */
const LISTED_TRACKS = 5;

/** A channel count as its speaker layout ("5.1"); other counts as a number of channels. */
function channelLayout(channels: number | null | undefined): string | null {
  if (!channels) return null;
  const layouts: Record<number, string> = { 1: '1.0', 2: '2.0', 6: '5.1', 8: '7.1' };
  return layouts[channels] ?? translate('audio.channels', { count: channels });
}

/**
 * A track's name: its language, whether that is the title's original language or a dub (when the
 * original is known), and its channel layout: "English · Original (5.1)".
 */
function trackLabel(
  track: Pick<AudioSourceTrack, 'language' | 'channels'>,
  originalLanguage: string | null | undefined,
  fallback: string
): string {
  const language = mediaLanguage(track.language === 'und' ? null : track.language);
  const kind =
    language && originalLanguage
      ? language === mediaLanguage(originalLanguage)
        ? translate('audio.original')
        : translate('audio.dubbed')
      : null;
  const layout = channelLayout(track.channels);
  return `${[language ? languageName(language) : fallback, kind].filter(Boolean).join(' · ')}${layout ? ` (${layout})` : ''}`;
}

/** The languages a source plays in: its file's tracks once probed, else its release name's. */
function languagesOf(source: AudioSourceDto): string[] {
  const probed = (source.audioTracks ?? []).flatMap(track => mediaLanguage(track.language) ?? []);
  return [...new Set(probed.length ? probed : source.releaseLanguages)];
}

/** The size of a file, in the units people read sizes in. */
function sizeText(bytes: number, locale: string): string {
  const gigabytes = bytes / 1024 ** 3;
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return gigabytes >= 1
    ? `${format.format(gigabytes)} GB`
    : `${format.format(bytes / 1024 ** 2)} MB`;
}

export interface AudioMenuProps {
  /** The trigger's navigation ID in the player's controls row. */
  navId?: string;
  /** The panel opened or closed (the player keeps its controls up, and loads the sources). */
  onOpenChange?: (open: boolean) => void;
  /** The player, which the sheet covers the end of (also in full screen). */
  container?: HTMLElement | null;
  /** The playing file's audio tracks; unknown until its delivery is. */
  tracks?: AudioTrack[];
  selectedTrackIndex?: number;
  onSelectTrack?: (index: number) => void;
  /** The language the title was made in, so tracks read as Original or Dubbed. */
  originalLanguage?: string | null;
  /** The profile's audio language for this title (ISO 639-1), marked Default. */
  defaultLanguage?: string;
  /** The title's known sources; undefined while they load. */
  sources?: AudioSourceDto[];
  sourcesFailed?: boolean;
  /** The source playing now, left out of the alternatives. */
  currentSourceId?: number;
  searching?: boolean;
  searchFailed?: boolean;
  /** Looks for the title's sources in a language (ISO 639-1). */
  onSearch: (language: string) => void;
  /** Plays another source, with its audio in `language`. */
  onPlaySource: (sourceId: number, language: string) => void;
}

/**
 * Audio: an IconButton in the player's controls row opening a modal side sheet over the player
 * (`container`), its full height. It picks the playing file's audio track (the profile's
 * language marked Default), and plays the title from another source in a chosen language: the
 * languages the title has sources in are offered first, a search looks for more, and the sources
 * in the chosen language are listed to play.
 */
export function AudioMenu({
  navId,
  onOpenChange,
  container,
  tracks = [],
  selectedTrackIndex,
  onSelectTrack,
  originalLanguage,
  defaultLanguage,
  sources,
  sourcesFailed = false,
  currentSourceId,
  searching = false,
  searchFailed = false,
  onSearch,
  onPlaySource,
}: AudioMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [allTracks, setAllTracks] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => {
    onOpenChangeRef.current?.(open);
  }, [open]);

  // Tracks
  const selectedTrack = tracks.find(track => track.index === selectedTrackIndex);
  const playingLanguage = mediaLanguage(selectedTrack?.language);
  const defaultTrack =
    tracks.find(track => defaultLanguage && mediaLanguage(track.language) === defaultLanguage) ??
    tracks.find(track => track.isDefault);
  const shownTracks =
    allTracks || tracks.length <= LISTED_TRACKS
      ? tracks
      : [
          ...tracks.slice(0, LISTED_TRACKS),
          ...(selectedTrack && tracks.indexOf(selectedTrack) >= LISTED_TRACKS
            ? [selectedTrack]
            : []),
        ];
  const trackOption = (track: AudioTrack): RadioOption => ({
    value: String(track.index),
    label: trackLabel(track, originalLanguage, t('audio.track', { number: track.index + 1 })),
    description: track.title ?? undefined,
    metadata: track === defaultTrack ? <Badge>{t('audio.default')}</Badge> : undefined,
  });

  // Sources in other languages: how many each language has, besides the one playing
  const alternatives = (sources ?? []).filter(source => source.id !== currentSourceId);
  const counts = new Map<string, number>();
  for (const source of alternatives)
    for (const language of languagesOf(source))
      counts.set(language, (counts.get(language) ?? 0) + 1);
  const known = [...counts.keys()].sort(
    (left, right) =>
      counts.get(right)! - counts.get(left)! ||
      languageName(left).localeCompare(languageName(right), t('meta.locale'))
  );
  const others = [...MEDIA_LANGUAGES]
    .filter(language => !counts.has(language))
    .sort((left, right) => languageName(left).localeCompare(languageName(right), t('meta.locale')));
  const languageItems: SelectItems = known.length
    ? [
        {
          label: t('audio.knownLanguages'),
          options: known.map(language => ({
            value: language,
            label: t('audio.languageWithSources', {
              language: languageName(language),
              count: counts.get(language)!,
            }),
          })),
        },
        {
          label: t('audio.otherLanguages'),
          options: others.map(language => ({ value: language, label: languageName(language) })),
        },
      ]
    : others.map(language => ({ value: language, label: languageName(language) }));

  /** The language chosen to search; until the viewer picks one, the likeliest wanted. */
  const [picked, setPicked] = useState<string | null>(null);
  const suggested =
    known.find(language => language !== playingLanguage) ??
    (defaultLanguage && defaultLanguage !== playingLanguage ? defaultLanguage : undefined) ??
    others.find(language => language !== playingLanguage) ??
    'en';
  const searchLanguage = picked ?? suggested;
  const inLanguage = alternatives.filter(source => languagesOf(source).includes(searchLanguage));

  /**
   * The source asked for, shown as switching while its session is requested: until another
   * session plays, whether that source or one played instead.
   */
  const [switching, setSwitching] = useState<{ to: number; from: number | undefined } | null>(null);
  const switchingTo = switching?.to ?? null;
  useEffect(() => {
    if (switching && switching.from !== currentSourceId) setSwitching(null);
  }, [currentSourceId, switching]);

  const sourceRow = (source: AudioSourceDto) => {
    const track = source.audioTracks?.find(item => mediaLanguage(item.language) === searchLanguage);
    return (
      <ListItem
        key={source.id}
        navId={NAV.source(source.id)}
        leading={<PlayIcon aria-hidden="true" />}
        title={trackLabel(
          { language: searchLanguage, channels: track?.channels ?? null },
          originalLanguage,
          languageName(searchLanguage)
        )}
        description={[
          qualityLabel(source.quality),
          sourceLabel(source.sourceType),
          source.videoCodec?.toLowerCase().replace('_10bit', ' 10-bit'),
          sizeText(source.size, t('meta.locale')),
        ]
          .filter(Boolean)
          .join(' · ')}
        metadata={switchingTo === source.id ? t('audio.switching') : undefined}
        onClick={() => {
          // The language stays chosen once its source plays, whatever is suggested then
          setPicked(searchLanguage);
          setSwitching({ to: source.id, from: currentSourceId });
          onPlaySource(source.id, searchLanguage);
        }}
      />
    );
  };

  return (
    <Popover
      open={open}
      onDismiss={() => setOpen(false)}
      modality="modal"
      title={t('audio.panelTitle')}
      hideTitle
      placement="sheet"
      container={container}
      initialNavId={tracks.length ? NAV.tracks : NAV.searchLanguage}
      align="end"
      size="lg"
      trigger={props => (
        <IconButton
          {...props}
          navId={navId}
          size="lg"
          label={t('audio.trigger')}
          icon={<HeadphonesIcon />}
          selected={open}
          onClick={() => setOpen(value => !value)}
        />
      )}
    >
      <SheetHeader
        icon={<HeadphonesIcon />}
        title={t('audio.panelTitle')}
        closeLabel={t('audio.close')}
        closeNavId={NAV.close}
        onClose={() => setOpen(false)}
      />
      <div className={styles.body}>
        <ScrollArea label={t('audio.panelTitle')}>
          <Part
            icon={<LanguageIcon />}
            title={t('audio.language')}
            description={t('audio.languageDescription')}
          >
            {tracks.length ? (
              <>
                <RadioGroup
                  navId={NAV.tracks}
                  appearance="rows"
                  label={t('audio.language')}
                  hideLabel
                  options={shownTracks.map(trackOption)}
                  value={selectedTrackIndex === undefined ? null : String(selectedTrackIndex)}
                  onChange={value => onSelectTrack?.(Number(value))}
                />
                {tracks.length > LISTED_TRACKS && (
                  <List>
                    <ListItem
                      navId={NAV.moreTracks}
                      title={allTracks ? t('audio.fewerLanguages') : t('audio.moreLanguages')}
                      metadata={
                        allTracks ? (
                          <ChevronUpIcon aria-hidden="true" />
                        ) : (
                          <ChevronDownIcon aria-hidden="true" />
                        )
                      }
                      onClick={() => setAllTracks(value => !value)}
                    />
                  </List>
                )}
              </>
            ) : (
              <Text tone="secondary">{t('audio.noTracks')}</Text>
            )}
          </Part>
          <Part
            icon={<SearchIcon />}
            title={t('audio.search')}
            description={t('audio.searchDescription')}
          >
            <div className={styles.searchRow}>
              <span className={styles.searchLanguage}>
                <Select
                  navId={NAV.searchLanguage}
                  label={t('audio.searchLanguage')}
                  labelHidden
                  fullWidth
                  items={languageItems}
                  value={searchLanguage}
                  onChange={setPicked}
                />
              </span>
              <Button
                navId={NAV.search}
                loading={searching}
                onClick={() => {
                  if (searching) return;
                  setPicked(searchLanguage);
                  onSearch(searchLanguage);
                }}
              >
                {searching ? t('audio.searching') : t('audio.searchButton')}
              </Button>
            </div>
            {searchFailed && (
              <div className={styles.note}>
                <Text tone="secondary" role="status">
                  {t('audio.searchFailed')}
                </Text>
              </div>
            )}
          </Part>
          <div className={styles.part}>
            <List>
              <ListItem
                navId={NAV.sources}
                leading={<CloudIcon aria-hidden="true" />}
                title={t('audio.sources', { count: inLanguage.length })}
                metadata={
                  sourcesOpen ? (
                    <ChevronUpIcon aria-hidden="true" />
                  ) : (
                    <ChevronDownIcon aria-hidden="true" />
                  )
                }
                onClick={() => setSourcesOpen(value => !value)}
              />
            </List>
            {sourcesOpen &&
              (sourcesFailed ? (
                <Text tone="secondary">{t('audio.loadFailed')}</Text>
              ) : inLanguage.length ? (
                <List>{inLanguage.map(sourceRow)}</List>
              ) : (
                sources && (
                  <Text tone="secondary">
                    {t('audio.noSources', { language: languageName(searchLanguage) })}
                  </Text>
                )
              ))}
          </div>
        </ScrollArea>
      </div>
    </Popover>
  );
}
