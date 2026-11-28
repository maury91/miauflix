import type { preferences as english } from '../en/preferences';
import type { Translation } from '../types';

export const preferences: Translation<typeof english> = {
  'profileMenu.label': 'Profilis',
  'profileMenu.session': 'Seansas',
  'profileMenu.watchingNow': 'Dabar žiūri',
  'profileMenu.switch': 'Keisti profilį',
  'profileMenu.edit': 'Redaguoti profilį',
  'profileMenu.preferences': 'Nuostatos',
  'profileMenu.logout': 'Atsijungti',
  'preferences.title': 'Nuostatos',
  'preferences.description': 'Profilio „{name}“ kalbos nuostatos visuose įrenginiuose.',
  'preferences.back': 'Grįžti į pradžią',
  'preferences.interface': 'Sąsaja',
  'preferences.interfaceLanguage': 'Sąsajos kalba',
  'preferences.interfaceLanguageDescription': 'Meniu, mygtukai ir pranešimai.',
  'preferences.watchOnce': 'Vienkartiniai atsisiuntimai',
  'preferences.watchOnceDescription':
    'Atsisiunčia visą failą prieš peržiūrą ir ištrina jį pasibaigus peržiūrai.',
  'preferences.audio': 'Garsas',
  'preferences.subtitles': 'Subtitrai',
  'preferences.moviesAndShows': 'Filmai ir serialai',
  'preferences.anime': 'Anime',
  'preferences.audioDescription': 'Jei yra garso takelis šia kalba, atkūrimas pradedamas su juo.',
  'preferences.animeAudioDescription': 'Anime kūriniams galite pasirinkti kitą garso kalbą.',
  'preferences.subtitlesDescription':
    '„Miauwatch“ pirmiausia ieško subtitrų šia kalba ir siūlo juos po atkūrimo juosta.',
  'preferences.autoSubtitles': 'Automatiniai subtitrai',
  'preferences.autoSubtitlesDescription':
    'Pradėjus žiūrėti, įjungiami subtitrai jūsų pasirinkta subtitrų kalba, nebent tam kūriniui juos pakeitėte.',
  'preferences.animeSubtitlesDescription': 'Anime kūriniams galite pasirinkti kitą subtitrų kalbą.',
  'preferences.deviceLanguage': 'Įrenginio kalba ({language})',
  'preferences.sameAsMovies': 'Kaip filmams ir serialams',
  'preferences.original': 'Originalo kalba',
  'preferences.saving': 'Saugoma…',
  'preferences.saved': 'Nuostatos išsaugotos',
  'preferences.saveFailed': 'Nepavyko išsaugoti nuostatų. Pabandykite dar kartą.',
};
