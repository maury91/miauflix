import type { NotificationItem } from '@features/notifications/api/notifications.api';
import type { PlayableRef } from '@miauflix/backend';
import { qualityLabel, sourceLabel } from '@shared/ui/quality-badge/quality';

export interface NotificationCopy {
  heading: string;
  /** Sentence before the quality badge, e.g. "S1 E6 is now available to watch in". */
  text: string;
  /** Resolution shown on the badge, when known. */
  qualityLabel: string | null;
  /** Release type after the badge, e.g. "Blu-ray (was CAM)". */
  release: string | null;
}

function episodeLabel({ seasonNumber, episodeNumber }: NotificationItem): string | null {
  return seasonNumber != null && episodeNumber != null
    ? `S${seasonNumber} E${episodeNumber}`
    : null;
}

/** Heading and sentence for a notification, from its type rather than its stored message. */
export function notificationCopy(notification: NotificationItem): NotificationCopy {
  const label = qualityLabel(notification.quality);
  const release = sourceLabel(notification.sourceType);
  const withQuality = (sentence: string) => (label ? `${sentence} in` : `${sentence}.`);

  if (notification.type === 'movie_quality_upgrade') {
    // Notifications stored before quality was recorded keep their original sentence.
    if (!label && !release)
      return {
        heading: 'Better quality available',
        text: notification.message,
        qualityLabel: null,
        release: null,
      };
    const previous = sourceLabel(notification.previousSourceType);
    const upgrade = [release, previous && `(was ${previous})`].filter(Boolean).join(' ');
    return {
      heading: 'Better quality available',
      text: label
        ? `${notification.title} is now available in`
        : `${notification.title} is now available as`,
      qualityLabel: label,
      release: upgrade || null,
    };
  }

  const episode = notification.mediaType === 'tv' ? episodeLabel(notification) : null;
  if (notification.mediaType === 'tv')
    return {
      heading: 'New episode available',
      text: withQuality(`${episode ?? 'A new episode'} is now available to watch`),
      qualityLabel: label,
      release: label ? release : null,
    };

  return {
    heading: 'Just added',
    text: withQuality(`${notification.title} is now available`),
    qualityLabel: label,
    release: label ? release : null,
  };
}

/** What a notification plays when opened; null when it names no single episode. */
export function notificationPlayable(notification: NotificationItem): PlayableRef | null {
  if (notification.mediaType === 'movie') return { kind: 'movie', mediaId: notification.mediaId };
  if (notification.seasonNumber == null || notification.episodeNumber == null) return null;
  return {
    kind: 'episode',
    showMediaId: notification.mediaId,
    seasonNumber: notification.seasonNumber,
    episodeNumber: notification.episodeNumber,
  };
}
