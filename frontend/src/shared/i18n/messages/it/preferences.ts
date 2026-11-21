import type { preferences as english } from '../en/preferences';
import type { Translation } from '../types';

export const preferences: Translation<typeof english> = {
  'profileMenu.label': 'Profilo',
  'profileMenu.session': 'Sessione',
  'profileMenu.watchingNow': 'Sta guardando',
  'profileMenu.switch': 'Cambia profilo',
  'profileMenu.edit': 'Modifica profilo',
  'profileMenu.preferences': 'Preferenze',
  'profileMenu.logout': 'Esci',
  'preferences.title': 'Preferenze',
  'preferences.description':
    'Le lingue di {name}, su ogni dispositivo in cui guarda questo profilo.',
  'preferences.back': 'Torna alla Home',
  'preferences.interface': 'Interfaccia',
  'preferences.interfaceLanguage': "Lingua dell'interfaccia",
  'preferences.interfaceLanguageDescription': 'Menu, pulsanti e messaggi.',
  'preferences.audio': 'Audio',
  'preferences.subtitles': 'Sottotitoli',
  'preferences.moviesAndShows': 'Film e serie TV',
  'preferences.anime': 'Anime',
  'preferences.audioDescription':
    'La lingua in cui inizia la riproduzione, quando la release la include.',
  'preferences.animeAudioDescription': "Gli anime possono usare un'altra lingua dell'audio.",
  'preferences.subtitlesDescription': 'Cercati per primi e proposti sotto la barra di avanzamento.',
  'preferences.animeSubtitlesDescription':
    "Gli anime possono usare un'altra lingua dei sottotitoli.",
  'preferences.deviceLanguage': 'Lingua del dispositivo ({language})',
  'preferences.sameAsMovies': 'Come film e serie TV',
  'preferences.original': 'Lingua originale',
  'preferences.saving': 'Salvataggio…',
  'preferences.saved': 'Salvate',
  'preferences.saveFailed': 'Non è stato possibile salvare le preferenze. Riprova.',
};
