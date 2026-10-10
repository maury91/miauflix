import { audioLanguage } from '@features/player/lib/audio-language';
import type { CreatePlaybackSessionResponse, SubtitleCandidateDto } from '@miauflix/backend';
import { PALETTE } from '@shared/config/constants';
import { Button as BaseButton } from '@shared/ui/button/Button';
import { type RefObject, useEffect, useState } from 'react';
import styled from 'styled-components';

import { SubtitleTiming, type SubtitleTimingCue } from './SubtitleTiming';

const languages = [
  ['en', 'English'],
  ['lt', 'Lithuanian'],
  ['pl', 'Polish'],
  ['ru', 'Russian'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['it', 'Italian'],
  ['pt', 'Portuguese'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['zh', 'Chinese'],
];

interface Preferences {
  language: string;
  hearingImpaired: boolean;
}

function readPreferences(key: string | null): Preferences {
  const browserLanguage =
    typeof navigator === 'undefined' ? 'en' : navigator.language.split('-')[0];
  const defaults = {
    language: languages.some(([code]) => code === browserLanguage) ? browserLanguage : 'en',
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
        typeof stored.language === 'string' && languages.some(([code]) => code === stored.language)
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

// eslint-disable-next-line no-restricted-syntax -- Existing media/player controls; see shared/ui/README.md.
const Button = styled(BaseButton)`
  min-width: 44px;
  min-height: 44px;
  padding: 0.45rem 0.7rem;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 1rem;
  box-shadow: none;
`;

const Panel = styled.div`
  position: absolute;
  right: 5vw;
  bottom: calc(100% + 0.5rem);
  z-index: 3;
  display: grid;
  gap: 0.7rem;
  box-sizing: border-box;
  width: min(26rem, 90vw);
  min-width: 0;
  max-height: 70vh;
  overflow: auto;
  color-scheme: dark;
  padding: 1rem;
  border: 1px solid ${PALETTE.background.border};
  border-radius: 0.5rem;
  background: ${PALETTE.background.surface2};
  color: ${PALETTE.text.primary};
  box-shadow: 0 0.5rem 2rem #0009;
  label {
    display: grid;
    min-width: 0;
    gap: 0.35rem;
  }
  select,
  input[type='number'] {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: 2.5rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid ${PALETTE.background.border};
    border-radius: 0.25rem;
    background: ${PALETTE.background.surface1};
    color: ${PALETTE.text.primary};
    font: inherit;
    text-overflow: ellipsis;
  }
  option {
    background: ${PALETTE.background.surface2};
    color: ${PALETTE.text.primary};
  }
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid ${PALETTE.color.brand};
    outline-offset: 2px;
  }
  p {
    margin: 0;
    font-size: 0.9rem;
  }
`;

function candidateLabel(candidate: SubtitleCandidateDto): string {
  const details = [candidate.languageLabel];
  if (candidate.filenameSimilarity != null)
    details.push(`Filename match: ${candidate.filenameSimilarity}/100`);
  details.push(candidate.release);
  if (candidate.hearingImpaired) details.push('SDH');
  if (candidate.trusted) details.push('Trusted');
  if (candidate.match === 'file') details.push('Exact file');
  else if (candidate.match === 'release') details.push('Release match');
  return details.join(' · ');
}

export type AudioTrack = NonNullable<
  NonNullable<CreatePlaybackSessionResponse['delivery']>['audioTracks']
>[number];

function audioLabel(track: AudioTrack) {
  let language = track.language;
  if (language && language !== 'und') {
    try {
      language =
        new Intl.DisplayNames([navigator.language], { type: 'language' }).of(
          audioLanguage(language) ?? language
        ) ?? language;
    } catch {
      /* Keep unfamiliar language tags readable. */
    }
  } else language = `Track ${track.index + 1}`;
  return [
    language,
    track.title,
    track.codec?.toUpperCase(),
    track.channels ? `${track.channels} channels` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

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
}: {
  searchPreferences?: { language: string; hearingImpaired: boolean };
  videoRef?: RefObject<HTMLVideoElement | null>;
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
  const [open, setOpen] = useState(false);
  const [timingOpen, setTimingOpen] = useState(false);
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

  return (
    <>
      <Button
        type="button"
        aria-label={audioTracks && audioTracks.length > 1 ? 'Audio and subtitles' : 'Subtitles'}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        {audioTracks && audioTracks.length > 1 ? 'Audio / CC' : 'CC'}
      </Button>
      {open && (
        <Panel role="group" aria-label="Subtitle settings">
          {timingOpen && selectedId ? (
            <>
              <Button type="button" onClick={() => setTimingOpen(false)}>
                Back to subtitle settings
              </Button>
              <SubtitleTiming
                key={selectedId}
                cues={subtitleCues}
                videoRef={videoRef}
                pendingPosition={pendingPosition}
                offset={offset}
                onOffsetChange={onOffsetChange}
              />
            </>
          ) : (
            <>
              {audioTracks && audioTracks.length > 1 && onSelectAudioTrack && (
                <label>
                  Audio language
                  <select
                    value={selectedAudioTrackIndex ?? 0}
                    onChange={event => onSelectAudioTrack(Number(event.target.value))}
                  >
                    {audioTracks.map(track => (
                      <option key={track.index} value={track.index}>
                        {audioLabel(track)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Language
                <select
                  value={language}
                  onChange={event =>
                    updatePreferences({ ...preferences, language: event.target.value })
                  }
                >
                  {languages.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  <input
                    type="checkbox"
                    checked={hearingImpaired}
                    onChange={event =>
                      updatePreferences({ ...preferences, hearingImpaired: event.target.checked })
                    }
                  />{' '}
                  Hearing impaired
                </span>
              </label>
              <Button
                type="button"
                disabled={loading}
                onClick={() => onSearch(language, hearingImpaired)}
              >
                {loading ? 'Searching…' : 'Find subtitles'}
              </Button>
              <label>
                Subtitles
                <select
                  value={selectedId ?? ''}
                  onChange={event => onSelect(event.target.value || null)}
                  aria-label="Subtitle track"
                >
                  <option value="">Off</option>
                  {candidates.map(candidate => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidateLabel(candidate)}
                    </option>
                  ))}
                </select>
              </label>
              {selectedId && (
                <Button type="button" onClick={() => setTimingOpen(true)}>
                  Adjust subtitle timing ({offset > 0 ? '+' : ''}
                  {Number(offset.toFixed(2))}s)
                </Button>
              )}
            </>
          )}
          {message && (
            <p role="status" aria-live="polite">
              {message}
            </p>
          )}
          {configured === false && <p>Subtitle search is not configured on this server.</p>}
          {configured && available === false && <p>Subtitle provider is currently unavailable.</p>}
        </Panel>
      )}
    </>
  );
}
