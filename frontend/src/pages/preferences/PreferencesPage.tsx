import { useUpdateLanguagePreferencesMutation } from '@features/profiles/api/profiles.api';
import { languagePreferencesOf } from '@features/profiles/lib/language-preferences';
import type { LanguagePreferences } from '@miauflix/backend';
import { List, Message, Section, Select, SettingRow } from '@shared/design-system';
import type { SelectItems } from '@shared/design-system/option-list/selectItems';
import {
  INTERFACE_LANGUAGES,
  languageName,
  MEDIA_LANGUAGES,
  type MessageKey,
  ORIGINAL_LANGUAGE,
  resolveInterfaceLanguage,
  type Translate,
  useT,
} from '@shared/i18n';
import { useAppSelector } from '@store';
import { selectCurrentSessionId, selectCurrentUser } from '@store/slices/auth';
import { useState } from 'react';

import { SettingsLayout } from '../settings/SettingsLayout';

/** The select value for "no choice" (null): the device's language, or anime's fallback. */
const AUTOMATIC = 'auto';

const NAV = {
  interface: 'preferences-interface',
  audio: 'preferences-audio',
  animeAudio: 'preferences-anime-audio',
  subtitles: 'preferences-subtitles',
  animeSubtitles: 'preferences-anime-subtitles',
} as const;

type Kind = 'audio' | 'subtitles';
type Audience = 'default' | 'anime';

const ROWS = {
  audio: {
    default: { navId: NAV.audio, description: 'preferences.audioDescription' },
    anime: { navId: NAV.animeAudio, description: 'preferences.animeAudioDescription' },
  },
  subtitles: {
    default: { navId: NAV.subtitles, description: 'preferences.subtitlesDescription' },
    anime: { navId: NAV.animeSubtitles, description: 'preferences.animeSubtitlesDescription' },
  },
} as const satisfies Record<Kind, Record<Audience, { navId: string; description: MessageKey }>>;

/**
 * The watching profile's languages: the interface's, and the audio and subtitles titles start
 * with (anime has its own). Each choice is saved as soon as it is made.
 */
export default function PreferencesPage({ onDismiss }: { onDismiss: () => void }) {
  const t = useT();
  const user = useAppSelector(selectCurrentUser);
  const session = useAppSelector(selectCurrentSessionId);
  const [save, saving] = useUpdateLanguagePreferencesMutation();
  const [changed, setChanged] = useState(false);
  const preferences = languagePreferencesOf(user);

  const update = (next: LanguagePreferences) => {
    if (!session) return;
    setChanged(true);
    void save({ session, preferences: next });
  };
  const fromValue = (value: string) => (value === AUTOMATIC ? null : value);
  const choose = (kind: Kind, audience: Audience) => (value: string) =>
    update({ ...preferences, [kind]: { ...preferences[kind], [audience]: fromValue(value) } });

  const row = (kind: Kind, audience: Audience) => {
    const anime = audience === 'anime';
    const { navId, description } = ROWS[kind][audience];
    return (
      <SettingRow
        title={t(anime ? 'preferences.anime' : 'preferences.moviesAndShows')}
        description={t(description)}
        control={props => (
          <Select
            {...props}
            navId={navId}
            value={preferences[kind][audience] ?? AUTOMATIC}
            items={mediaLanguageItems(t, { original: kind === 'audio', anime })}
            onChange={choose(kind, audience)}
          />
        )}
      />
    );
  };

  return (
    <SettingsLayout
      title={t('preferences.title')}
      description={t('preferences.description', {
        name: user?.displayName || user?.email || '',
      })}
      onBack={onDismiss}
      backLabel={t('preferences.back')}
      initialNavId={NAV.interface}
    >
      <Section title={t('preferences.interface')}>
        <List>
          <SettingRow
            title={t('preferences.interfaceLanguage')}
            description={t('preferences.interfaceLanguageDescription')}
            control={props => (
              <Select
                {...props}
                navId={NAV.interface}
                value={preferences.interface ?? AUTOMATIC}
                items={interfaceItems(t)}
                onChange={value => update({ ...preferences, interface: fromValue(value) })}
              />
            )}
          />
        </List>
      </Section>
      <Section title={t('preferences.audio')}>
        <List>
          {row('audio', 'default')}
          {row('audio', 'anime')}
        </List>
      </Section>
      <Section title={t('preferences.subtitles')}>
        <List>
          {row('subtitles', 'default')}
          {row('subtitles', 'anime')}
        </List>
      </Section>
      {changed && (
        <Message
          tone={saving.isError ? 'danger' : 'success'}
          toneLabel={saving.isError ? t('common.error') : undefined}
          live={saving.isError ? 'assertive' : 'polite'}
        >
          {saving.isLoading
            ? t('preferences.saving')
            : saving.isError
              ? t('preferences.saveFailed')
              : t('preferences.saved')}
        </Message>
      )}
    </SettingsLayout>
  );
}

function deviceLanguage(t: Translate, code: string): string {
  return t('preferences.deviceLanguage', { language: languageName(code) });
}

/** Device language first, then each interface language in its own name's translation. */
function interfaceItems(t: Translate): SelectItems {
  const device = resolveInterfaceLanguage(null, navigator.languages ?? []);
  return [
    { value: AUTOMATIC, label: deviceLanguage(t, device) },
    ...INTERFACE_LANGUAGES.map(code => ({ value: code, label: languageName(code) })),
  ];
}

function mediaLanguageItems(
  t: Translate,
  { original, anime }: { original: boolean; anime: boolean }
): SelectItems {
  const device = navigator.language?.split('-')[0] ?? 'en';
  return [
    {
      value: AUTOMATIC,
      label: anime ? t('preferences.sameAsMovies') : deviceLanguage(t, device),
    },
    ...(original ? [{ value: ORIGINAL_LANGUAGE, label: t('preferences.original') }] : []),
    ...MEDIA_LANGUAGES.map(code => ({ value: code, label: languageName(code) })).sort(
      (left, right) => left.label.localeCompare(right.label, t('meta.locale'))
    ),
  ];
}
