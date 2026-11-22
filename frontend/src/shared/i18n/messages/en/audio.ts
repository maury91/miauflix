import type { MessageSection } from '../types';

/** The player's audio panel: the file's tracks and sources in other languages. */
export const audio = {
  'audio.trigger': 'Audio',
  'audio.panelTitle': 'Audio',
  'audio.close': 'Close',
  'audio.language': 'Audio language',
  'audio.languageDescription': 'Choose the audio track for playback',
  'audio.default': 'Default',
  'audio.original': 'Original',
  'audio.dubbed': 'Dubbed',
  'audio.track': 'Track {number}',
  'audio.channels': '{count} channels',
  'audio.moreLanguages': 'More languages',
  'audio.fewerLanguages': 'Fewer languages',
  'audio.noTracks': 'The audio tracks are known once the video starts.',
  'audio.search': 'Search sources in a language',
  'audio.searchDescription': 'Find alternative sources with a specific audio language',
  'audio.searchLanguage': 'Language to search',
  'audio.searchButton': 'Search',
  'audio.searching': 'Searching…',
  'audio.knownLanguages': 'With sources',
  'audio.otherLanguages': 'Other languages',
  'audio.languageWithSources': {
    one: '{language} · {count} source',
    other: '{language} · {count} sources',
  },
  'audio.sources': {
    one: 'Audio sources ({count})',
    other: 'Audio sources ({count})',
  },
  'audio.noSources': 'No other sources in {language} yet. Search to look for some.',
  'audio.searchFailed': "Couldn't search for sources. Try again later.",
  'audio.loadFailed': "Couldn't load this title's sources.",
  'audio.switching': 'Switching source…',
  'audio.playSource': 'Play this source',
} satisfies MessageSection;
