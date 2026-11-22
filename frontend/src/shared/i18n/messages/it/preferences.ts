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
  'preferences.description': 'Preferenze di lingua di {name} su tutti i dispositivi.',
  'preferences.back': 'Torna alla Home',
  'preferences.interface': 'Interfaccia',
  'preferences.interfaceLanguage': "Lingua dell'interfaccia",
  'preferences.interfaceLanguageDescription': 'Menu, pulsanti e messaggi.',
  'preferences.audio': 'Audio',
  'preferences.subtitles': 'Sottotitoli',
  'preferences.moviesAndShows': 'Film e serie TV',
  'preferences.anime': 'Anime',
  'preferences.audioDescription':
    'La riproduzione inizia in questa lingua se è disponibile una traccia audio.',
  'preferences.animeAudioDescription': 'Puoi scegliere una lingua audio diversa per gli anime.',
  'preferences.subtitlesDescription':
    'Miauflix cerca prima i sottotitoli in questa lingua e li propone sotto la barra di avanzamento.',
  'preferences.autoSubtitles': 'Sottotitoli automatici',
  'preferences.autoSubtitlesDescription':
    "I sottotitoli nella tua lingua dei sottotitoli si attivano all'avvio di un titolo, a meno che tu non li abbia cambiati per quel titolo.",
  'preferences.animeSubtitlesDescription':
    'Puoi scegliere una lingua diversa per i sottotitoli degli anime.',
  'preferences.deviceLanguage': 'Lingua del dispositivo ({language})',
  'preferences.sameAsMovies': 'Come film e serie TV',
  'preferences.original': 'Lingua originale',
  'preferences.saving': 'Salvataggio…',
  'preferences.saved': 'Preferenze salvate',
  'preferences.saveFailed': 'Impossibile salvare le preferenze. Riprova.',
};
