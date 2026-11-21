import type { MessageSection } from '../types';

/** The player: controls, prompts, playback status and subtitles. */
export const player = {
  'player.trying': 'Trying source {position} of {total} for “{title}”…',
  'player.downloadingPart': 'Downloading this part of “{title}”…',
  'player.converting': 'Converting “{title}” for playback…',
  'player.noSource':
    "“{title}” isn't available to watch yet. Select “Notify me” to get an alert when it's ready.",
  'player.noRoomMovie':
    "There isn't enough space to play this movie. Free up space on the server or increase its storage limit, then try again.",
  'player.noRoomEpisode':
    "There isn't enough space to play this episode. Free up space on the server or increase its storage limit, then try again.",
  'player.failure.unavailable':
    "“{title}” isn't available to watch yet. Try again later or pick something else.",
  'player.failure.session': 'Sign in again to watch “{title}”.',
  'player.failure.rateLimited':
    'Too many requests to check playback for “{title}”. Wait a moment and try again.',
  'player.failure.detail': "Couldn't play “{title}”. {detail}",
  'player.failure.offline':
    "Miauflix couldn't reach the playback service for “{title}”. Check your connection and try again.",
  'player.failure.server':
    "Couldn't prepare the source for “{title}”. Try again or pick something else.",
  'player.failure.generic': "Couldn't start “{title}”. Try again.",
  'player.failure.selectedSource': "Couldn't load the selected source for “{title}”. Try again.",
  'player.failure.allSources': 'None of the sources for “{title}” could be played. Try again.',
  'player.status.checking': 'Checking sources for “{title}”…',
  'player.status.preparing': 'Preparing “{title}” for playback…',
  'player.status.ready': 'Ready to play “{title}”.',
  'player.status.unavailable': "“{title}” isn't available to watch yet.",
  'player.status.error': "Couldn't start “{title}”.",
  'player.backToDetails': 'Back to details',
  'player.logo': 'Miauflix logo',
  'player.playFailed': "Couldn't start playback. Press Play again.",
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
  'player.notifyPromised': "We'll let you know when “{title}” is available to watch.",
  'player.notifyMe': 'Notify me',
  'player.notifyFailed': "Couldn't set up the alert. Try again.",
  'player.selectedTitle': 'Selected title',
  'player.audioConversionFailed':
    "Couldn't start converting the audio. Try playing the video again.",
  'player.audioFailed': "Couldn't play the audio. Try playing the video again.",
} satisfies MessageSection;
