import type { NotificationItem } from '@features/notifications/api/notifications.api';

import { homeMedia } from './home.fixtures';

// Relative to load time, so the panel always reads "2h ago", "1d ago", ...
const now = Date.now();
const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
const poster = (index: number) => homeMedia[index % homeMedia.length]?.poster ?? null;

const notification = (overrides: Partial<NotificationItem> & { id: number }): NotificationItem => ({
  type: 'source_available',
  mediaType: 'movie',
  mediaId: 1000 + overrides.id,
  title: 'Example Film',
  message: 'Example Film is now available to watch.',
  seasonNumber: null,
  episodeNumber: null,
  quality: null,
  sourceType: null,
  previousSourceType: null,
  poster: poster(overrides.id),
  createdAt: hoursAgo(overrides.id),
  readAt: null,
  ...overrides,
});

export const notificationUnreadItems: NotificationItem[] = [
  notification({
    id: 1,
    type: 'tv_episode_available',
    mediaType: 'tv',
    title: 'The End of Oak Street',
    seasonNumber: 1,
    episodeNumber: 6,
    quality: 'FHD',
    sourceType: 'WEB',
    createdAt: hoursAgo(2),
  }),
  notification({
    id: 2,
    title: 'The Housemaid',
    quality: '4K',
    sourceType: 'BLURAY',
    createdAt: hoursAgo(26),
  }),
  notification({
    id: 3,
    type: 'movie_quality_upgrade',
    title: 'Obsession',
    quality: 'FHD',
    sourceType: 'WEB',
    previousSourceType: 'CAM',
    createdAt: hoursAgo(50),
  }),
  notification({
    id: 4,
    title: 'Keeper',
    quality: 'HD',
    sourceType: 'TS',
    poster: null,
    createdAt: hoursAgo(98),
  }),
];

export const notificationReadItems: NotificationItem[] = [
  notification({
    id: 5,
    type: 'tv_episode_available',
    mediaType: 'tv',
    title: 'By Any Means',
    seasonNumber: 2,
    episodeNumber: 1,
    createdAt: hoursAgo(130),
    readAt: hoursAgo(120),
  }),
  notification({
    id: 6,
    type: 'movie_quality_upgrade',
    title: 'Carolina Caroline',
    message: 'A better Blu-ray source is available (previously WEB).',
    createdAt: hoursAgo(200),
    readAt: hoursAgo(190),
  }),
];
