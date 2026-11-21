import type { playerLanguages as english } from '../en/player-languages';
import type { Translation } from '../types';

export const playerLanguages: Translation<typeof english> = {
  'playerLanguages.label': 'Audio e sottotitoli',
  'playerLanguages.audio': '{language}',
  'playerLanguages.original': '{language} (originale) con sottotitoli',
  'playerLanguages.withSubtitles': '{language} con sottotitoli',
};
