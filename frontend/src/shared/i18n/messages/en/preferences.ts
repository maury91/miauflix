import type { MessageSection } from '../types';

/** The profile menu and the Preferences page. */
export const preferences = {
  'profileMenu.label': 'Profile',
  'profileMenu.session': 'Session',
  'profileMenu.watchingNow': 'Watching now',
  'profileMenu.switch': 'Switch profile',
  'profileMenu.edit': 'Edit profile',
  'profileMenu.preferences': 'Preferences',
  'profileMenu.logout': 'Sign out',
  'preferences.title': 'Preferences',
  'preferences.description': 'Language preferences for {name} on all devices.',
  'preferences.back': 'Back to Home',
  'preferences.interface': 'Interface',
  'preferences.interfaceLanguage': 'Interface language',
  'preferences.interfaceLanguageDescription': 'Menus, buttons and messages.',
  'preferences.watchOnce': 'Watch-once downloads',
  'preferences.watchOnceDescription':
    'Download the whole file before playing and delete it when playback finishes.',
  'preferences.audio': 'Audio',
  'preferences.subtitles': 'Subtitles',
  'preferences.moviesAndShows': 'Movies and TV shows',
  'preferences.anime': 'Anime',
  'preferences.audioDescription':
    'Playback starts in this language when an audio track is available.',
  'preferences.animeAudioDescription': 'Choose a different audio language for anime.',
  'preferences.subtitlesDescription':
    'Miauwatch looks for subtitles in this language first and offers them below the progress bar.',
  'preferences.autoSubtitles': 'Automatic subtitles',
  'preferences.autoSubtitlesDescription':
    'Subtitles in your subtitle language turn on when a title starts, unless you changed them for that title.',
  'preferences.animeSubtitlesDescription': 'Choose a different subtitle language for anime.',
  'preferences.deviceLanguage': 'Device language ({language})',
  'preferences.sameAsMovies': 'Same as movies and TV shows',
  'preferences.original': 'Original language',
  'preferences.saving': 'Saving…',
  'preferences.saved': 'Preferences saved',
  'preferences.saveFailed': "Couldn't save your preferences. Try again.",
} satisfies MessageSection;
