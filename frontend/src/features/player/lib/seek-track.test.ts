import { describe, expect, it } from 'vitest';

import {
  SEEK_DOWNLOADED_COLOR,
  SEEK_TRACK_COLOR,
  SEEK_UNKNOWN_COLOR,
  seekTrackBackground,
} from './seek-track';

const CLEAR = 'rgba(0, 0, 0, 0)';

describe('seekTrackBackground', () => {
  it('draws the watched part over the downloaded stretches over the gray track', () => {
    const background = seekTrackBackground(
      25,
      [
        [0, 300],
        [500, 512.5],
      ],
      'red'
    );
    expect(background.backgroundColor).toBe(SEEK_TRACK_COLOR);
    expect(background.backgroundImage).toBe(
      [
        `linear-gradient(to right, red 25%, ${CLEAR} 25%)`,
        `linear-gradient(to right, ${CLEAR} 0%, ${CLEAR} 0%, ${SEEK_DOWNLOADED_COLOR} 0%, ${SEEK_DOWNLOADED_COLOR} 30%, ${CLEAR} 30%, ${CLEAR} 50%, ${SEEK_DOWNLOADED_COLOR} 50%, ${SEEK_DOWNLOADED_COLOR} 51.25%, ${CLEAR} 51.25%)`,
      ].join(', ')
    );
  });

  it('shows a gray track with nothing downloaded yet', () => {
    expect(seekTrackBackground(0, [], 'red')).toEqual({
      backgroundColor: SEEK_TRACK_COLOR,
      backgroundImage: `linear-gradient(to right, red 0%, ${CLEAR} 0%)`,
    });
  });

  it('keeps the light track when downloads are unknown, and skips empty or out-of-range stretches', () => {
    expect(seekTrackBackground(10, null, 'red').backgroundColor).toBe(SEEK_UNKNOWN_COLOR);
    expect(seekTrackBackground(10, [[5, 5]], 'red').backgroundImage).not.toContain(
      SEEK_DOWNLOADED_COLOR
    );
    expect(seekTrackBackground(10, [[-10, 2000]], 'red').backgroundImage).toContain(
      `${SEEK_DOWNLOADED_COLOR} 0%, ${SEEK_DOWNLOADED_COLOR} 100%`
    );
  });
});
