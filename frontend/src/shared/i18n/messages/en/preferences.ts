import type { MessageSection } from '../types';

/** The profile menu and the Preferences page. */
export const preferences = {
  'profileMenu.label': 'Profile',
  'profileMenu.session': 'Session',
  'profileMenu.watchingNow': 'Watching now',
  'profileMenu.switch': 'Switch profile',
  'profileMenu.edit': 'Edit profile',
  'profileMenu.preferences': 'Preferences',
  'profileMenu.logout': 'Logout',
  'preferences.title': 'Preferences',
  'preferences.description': 'Languages for {name}, on every device this profile watches on.',
  'preferences.back': 'Back to Home',
  'preferences.interface': 'Interface',
  'preferences.interfaceLanguage': 'Interface language',
  'preferences.interfaceLanguageDescription': 'Menus, buttons and messages.',
  'preferences.audio': 'Audio',
  'preferences.subtitles': 'Subtitles',
  'preferences.moviesAndShows': 'Movies and TV shows',
  'preferences.anime': 'Anime',
  'preferences.audioDescription':
    'The language a title starts playing in, when the release has it.',
  'preferences.animeAudioDescription': 'Anime can use a different audio language.',
  'preferences.subtitlesDescription': 'Searched first and offered under the seek bar.',
  'preferences.animeSubtitlesDescription': 'Anime can use a different subtitle language.',
  'preferences.deviceLanguage': 'Device language ({language})',
  'preferences.sameAsMovies': 'Same as movies and TV shows',
  'preferences.original': 'Original language',
  'preferences.saving': 'Saving…',
  'preferences.saved': 'Saved',
  'preferences.saveFailed': 'Preferences could not be saved. Try again.',
} satisfies MessageSection;
