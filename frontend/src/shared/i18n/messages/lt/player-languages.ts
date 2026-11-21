import type { playerLanguages as english } from '../en/player-languages';
import type { Translation } from '../types';

export const playerLanguages: Translation<typeof english> = {
  'playerLanguages.label': 'Garsas ir subtitrai',
  'playerLanguages.audio': '{language}',
  'playerLanguages.original': '{language} (originalo kalba) su subtitrais',
  'playerLanguages.withSubtitles': '{language} su subtitrais',
};
