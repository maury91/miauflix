import type { MessageSection } from '../types';

/** The player: controls, prompts, playback status and subtitles. */
export const player = {
  'player.trying': 'Trying source {position} of {total} for “{title}”…',
  'player.downloadingPart': 'Downloading this part of “{title}”…',
  'player.converting': 'Converting “{title}” for playback…',
  'player.noSource':
    "There is no source for “{title}”. Press “Notify me” to receive a notification once it's out.",
  'player.noRoomMovie':
    "There isn't enough space to play this movie. Free up space on the server, or raise its storage limit, then retry.",
  'player.noRoomEpisode':
    "There isn't enough space to play this episode. Free up space on the server, or raise its storage limit, then retry.",
  'player.failure.unavailable':
    'No playable source is available for “{title}” yet. Try again later, or choose another title.',
  'player.failure.session':
    'Your session cannot access playback for “{title}”. Sign in again, then retry.',
  'player.failure.rateLimited':
    'Playback checks for “{title}” are temporarily limited. Wait a moment, then retry.',
  'player.failure.detail': 'Playback for “{title}” could not start: {detail}',
  'player.failure.offline':
    'Miauflix could not reach the playback service for “{title}”. Check your connection, then retry.',
  'player.failure.server':
    'The source for “{title}” could not be prepared. Retry or choose another title.',
  'player.failure.generic':
    'Playback for “{title}” could not start. Retry to try source preparation again.',
  'player.failure.selectedSource':
    'Playback for “{title}” could not load the selected source. Retry to try source preparation again.',
  'player.failure.allSources':
    'Playback for “{title}” could not load any of its sources. Retry to try source preparation again.',
  'player.status.checking': 'Checking sources for “{title}”…',
  'player.status.preparing': 'Preparing “{title}” for playback…',
  'player.status.ready': 'Ready to play “{title}”.',
  'player.status.unavailable': 'No playable source is available for “{title}” yet.',
  'player.status.error': 'Playback for “{title}” could not start.',
  'player.backToDetails': 'Back to details',
  'player.logo': 'Miauflix logo',
  'player.playFailed': 'Playback could not start. Try Play again.',
  'player.controls': 'Playback controls',
  'player.toolbar': 'Playback toolbar',
  'player.preparing': 'Preparing playback…',
  'player.seek': 'Seek',
  'player.timeOf': '{position} of {duration}',
  'player.play': 'Play',
  'player.pause': 'Pause',
  'player.fullscreen': 'Toggle fullscreen',
  'player.fullscreenUnavailable': 'Fullscreen is unavailable in this browser.',
  'player.mute': 'Mute',
  'player.unmute': 'Unmute',
  'player.volume': 'Volume',
  'player.label': 'Player',
  'player.skipIntro': 'Skip intro',
  'player.credits': 'Credits',
  'player.skipCredits': 'Skip credits ({seconds}s)',
  'player.watchCredits': 'Watch credits',
  'player.nextEpisode': 'Next episode',
  'player.playNext': 'Play next episode ({seconds}s)',
  'player.stay': 'Stay',
  'player.notifyPromised': "We'll notify you as soon as “{title}” is out.",
  'player.notifyMe': 'Notify me',
  'player.notifyFailed': 'The notification could not be saved. Try again.',
  'player.selectedTitle': 'Selected title',
  'player.audioConversionFailed': 'Audio conversion could not start. Retry playback.',
  'player.audioFailed': 'Audio playback failed. Retry playback.',
} satisfies MessageSection;
