import type { LanguageOption } from '@features/player/lib/language-options';
import { Button, Inline } from '@shared/design-system';
import { languageName, mediaLanguage, type MessageKey, useT } from '@shared/i18n';

const LABELS: Record<LanguageOption['kind'], MessageKey> = {
  audio: 'playerLanguages.audio',
  original: 'playerLanguages.original',
  subtitled: 'playerLanguages.withSubtitles',
};

export interface LanguageButtonsProps {
  options: readonly LanguageOption[];
  /** The audio track playing now. */
  audioTrackIndex: number | undefined;
  /** The language of the subtitles shown now; null when none are. */
  subtitleLanguage: string | null;
  onChoose: (option: LanguageOption) => void;
}

/**
 * The ways to watch under the seek bar: the preferred audio, the original audio with subtitles,
 * and the preferred audio with subtitles. The one playing now is selected.
 */
export function LanguageButtons({
  options,
  audioTrackIndex,
  subtitleLanguage,
  onChoose,
}: LanguageButtonsProps) {
  const t = useT();
  if (options.length === 0) return null;
  const showing = mediaLanguage(subtitleLanguage) ?? null;
  return (
    <div role="group" aria-label={t('playerLanguages.label')}>
      <Inline gap="sm" align="center">
        {options.map(option => {
          const selected =
            option.audioTrackIndex === audioTrackIndex && option.subtitleLanguage === showing;
          return (
            <Button
              key={option.kind}
              navId={`player-language-${option.kind}`}
              selected={selected}
              aria-pressed={selected}
              onClick={() => onChoose(option)}
            >
              {t(LABELS[option.kind], { language: languageName(option.audioLanguage) })}
            </Button>
          );
        })}
      </Inline>
    </div>
  );
}
