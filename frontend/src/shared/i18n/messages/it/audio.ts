import type { audio as english } from '../en/audio';
import type { Translation } from '../types';

export const audio: Translation<typeof english> = {
  'audio.trigger': 'Audio',
  'audio.panelTitle': 'Audio',
  'audio.close': 'Chiudi',
  'audio.language': 'Lingua audio',
  'audio.languageDescription': 'Scegli la traccia audio da riprodurre',
  'audio.default': 'Predefinita',
  'audio.original': 'Originale',
  'audio.dubbed': 'Doppiato',
  'audio.track': 'Traccia {number}',
  'audio.channels': '{count} canali',
  'audio.moreLanguages': 'Altre lingue',
  'audio.fewerLanguages': 'Meno lingue',
  'audio.noTracks': 'Le tracce audio sono note quando il video parte.',
  'audio.search': 'Cerca fonti in una lingua',
  'audio.searchDescription': 'Trova fonti alternative con una lingua audio specifica',
  'audio.searchLanguage': 'Lingua da cercare',
  'audio.searchButton': 'Cerca',
  'audio.searching': 'Ricerca…',
  'audio.knownLanguages': 'Con fonti',
  'audio.otherLanguages': 'Altre lingue',
  'audio.languageWithSources': {
    one: '{language} · {count} fonte',
    other: '{language} · {count} fonti',
  },
  'audio.sources': {
    one: 'Fonti audio ({count})',
    other: 'Fonti audio ({count})',
  },
  'audio.noSources': 'Ancora nessun’altra fonte in {language}. Cerca per trovarne.',
  'audio.searchFailed': 'Impossibile cercare fonti. Riprova più tardi.',
  'audio.loadFailed': 'Impossibile caricare le fonti di questo titolo.',
  'audio.switching': 'Cambio fonte…',
  'audio.playSource': 'Riproduci questa fonte',
};
