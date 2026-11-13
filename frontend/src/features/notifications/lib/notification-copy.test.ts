import type { NotificationItem } from '@features/notifications/api/notifications.api';
import { describe, expect, it } from 'vitest';

import { notificationCopy, notificationPlayable } from './notification-copy';

const item = (overrides: Partial<NotificationItem>): NotificationItem => ({
  id: 1,
  type: 'source_available',
  mediaType: 'movie',
  mediaId: 42,
  title: 'Example Film',
  message: 'stored message',
  seasonNumber: null,
  episodeNumber: null,
  quality: null,
  sourceType: null,
  previousSourceType: null,
  poster: null,
  createdAt: '2026-10-29T00:00:00.000Z',
  readAt: null,
  ...overrides,
});

describe('notificationCopy', () => {
  it('announces a new episode with its quality', () => {
    expect(
      notificationCopy(
        item({
          type: 'tv_episode_available',
          mediaType: 'tv',
          seasonNumber: 1,
          episodeNumber: 6,
          quality: 'FHD',
          sourceType: 'WEB',
        })
      )
    ).toEqual({
      heading: 'New episode available',
      text: 'S1 E6 is now available to watch in',
      qualityLabel: '1080p',
      release: 'WEB',
    });
  });

  it('announces a just-added movie without a known quality', () => {
    expect(notificationCopy(item({}))).toEqual({
      heading: 'Just added',
      text: 'Example Film is now available.',
      qualityLabel: null,
      release: null,
    });
  });

  it('describes a quality upgrade with the previous release type', () => {
    expect(
      notificationCopy(
        item({
          type: 'movie_quality_upgrade',
          quality: '4K',
          sourceType: 'BLURAY',
          previousSourceType: 'CAM',
        })
      )
    ).toMatchObject({ qualityLabel: '4K', release: 'Blu-ray (was CAM)' });
  });

  it('keeps the stored message for upgrades recorded without quality', () => {
    expect(notificationCopy(item({ type: 'movie_quality_upgrade' })).text).toBe('stored message');
  });
});

describe('notificationPlayable', () => {
  it('plays the movie or the named episode', () => {
    expect(notificationPlayable(item({}))).toEqual({ kind: 'movie', mediaId: 42 });
    expect(
      notificationPlayable(item({ mediaType: 'tv', seasonNumber: 2, episodeNumber: 3 }))
    ).toEqual({ kind: 'episode', showMediaId: 42, seasonNumber: 2, episodeNumber: 3 });
    expect(notificationPlayable(item({ mediaType: 'tv' }))).toBeNull();
  });
});
