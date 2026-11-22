import type { audio as english } from '../en/audio';
import type { Translation } from '../types';

export const audio: Translation<typeof english> = {
  'audio.trigger': 'Garsas',
  'audio.panelTitle': 'Garsas',
  'audio.close': 'Uždaryti',
  'audio.language': 'Garso kalba',
  'audio.languageDescription': 'Pasirinkite atkūrimo garso takelį',
  'audio.default': 'Numatytasis',
  'audio.original': 'Originalas',
  'audio.dubbed': 'Įgarsinta',
  'audio.track': '{number} takelis',
  'audio.channels': 'Kanalai: {count}',
  'audio.moreLanguages': 'Daugiau kalbų',
  'audio.fewerLanguages': 'Mažiau kalbų',
  'audio.noTracks': 'Garso takeliai paaiškės, kai vaizdo įrašas prasidės.',
  'audio.search': 'Ieškoti šaltinių kita kalba',
  'audio.searchDescription': 'Raskite kitų šaltinių su norima garso kalba',
  'audio.searchLanguage': 'Paieškos kalba',
  'audio.searchButton': 'Ieškoti',
  'audio.searching': 'Ieškoma…',
  'audio.knownLanguages': 'Su šaltiniais',
  'audio.otherLanguages': 'Kitos kalbos',
  'audio.languageWithSources': {
    one: '{language} · {count} šaltinis',
    few: '{language} · {count} šaltiniai',
    other: '{language} · {count} šaltinių',
  },
  'audio.sources': {
    one: 'Garso šaltiniai ({count})',
    other: 'Garso šaltiniai ({count})',
  },
  'audio.noSources': 'Kitų šaltinių kalba „{language}“ dar nėra. Ieškokite jų.',
  'audio.searchFailed': 'Nepavyko ieškoti šaltinių. Bandykite vėliau.',
  'audio.loadFailed': 'Nepavyko įkelti šio pavadinimo šaltinių.',
  'audio.switching': 'Keičiamas šaltinis…',
  'audio.playSource': 'Leisti šį šaltinį',
};
