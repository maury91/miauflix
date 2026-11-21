import type { MessageSection } from '../types';

/** Connecting Trakt. */
export const integrations = {
  'integrations.scanQr': 'Scan the QR code',
  'integrations.orOpen': 'Or open {url} and enter this code.',
  'integrations.scanLabel': 'QR code to connect your Trakt account',
  'integrations.code': 'Code',
  'integrations.codeCopied': 'Code copied',
  'integrations.benefit.watchlist': 'Sync your watchlist',
  'integrations.benefit.progress': 'Track your progress',
  'integrations.benefit.recommendations': 'Get movie recommendations',
  'integrations.withTrakt': 'With Trakt you can:',
  'integrations.benefits': 'Trakt benefits',
  'integrations.copyFailed': "Couldn't copy the code. Enter it manually.",
  'integrations.startFailed': "Couldn't start connecting to Trakt",
  'integrations.title': 'Connect Trakt',
  'integrations.description': 'Link your Trakt and Miauflix accounts.',
  'integrations.close': 'Close Trakt dialog',
  'integrations.openTrakt': 'Open Trakt',
  'integrations.copyCode': 'Copy code',
  'integrations.letsGo': "Let's go",
  'integrations.neverAsk': 'Don’t ask again',
} satisfies MessageSection;
