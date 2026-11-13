import { readMediaSubtitles, saveMediaSubtitles } from '@features/player/lib/media-subtitles';
import type { SubtitleCandidateDto } from '@miauflix/backend';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchSubtitles } = vi.hoisted(() => ({ searchSubtitles: vi.fn() }));

vi.mock('@features/player/api/playback.api', () => ({
  useSearchSubtitlesMutation: () => [searchSubtitles],
}));
vi.mock('@features/player/lib/ass-subtitles', () => ({
  assRendererSupported: () => false,
  useAssSubtitles: () => undefined,
}));
vi.mock('@features/player/lib/subtitle-font', () => ({ useSubtitleFont: () => undefined }));

import type { PlaybackSource } from './usePlaybackSource';
import { useSubtitles } from './useSubtitles';

const storageKey = 'subtitles:test';
const session = { streamingKey: 'key' } as PlaybackSource['session'];
const candidate = {
  id: 'track-1',
  fileId: 11,
  language: 'it',
  languageLabel: 'Italian',
  hearingImpaired: false,
  provider: 'opensubtitles',
} as unknown as SubtitleCandidateDto;

function renderSubtitles() {
  // Refs keep their identity across renders, as they do in the player.
  const sessionStorageKey = { current: storageKey };
  const videoRef = { current: null };
  const resumeRef = { current: undefined };
  return renderHook(() =>
    useSubtitles({
      session,
      storageKey,
      sessionStorageKey,
      videoRef,
      mediaElement: null,
      resumeRef,
      playsInAvplay: false,
      audioSeek: null,
      audioTrackIndex: undefined,
    })
  );
}

describe('useSubtitles', () => {
  beforeEach(() => {
    window.localStorage.clear();
    searchSubtitles.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ configured: true, available: true, candidates: [candidate] }),
    });
  });

  it('searches locally in the browser language when nothing is remembered', async () => {
    const { result } = renderSubtitles();
    await waitFor(() => expect(result.current.candidates).toEqual([candidate]));
    expect(searchSubtitles).toHaveBeenCalledWith(
      expect.objectContaining({ streamingKey: 'key', refresh: false, localOnly: true })
    );
    expect(result.current.selectedId).toBeNull();
  });

  it('restores the remembered track and offset, and remembers changes', async () => {
    saveMediaSubtitles(storageKey, {
      language: 'it',
      hearingImpaired: false,
      selectedFileId: 11,
      offset: 1.5,
    });
    const { result } = renderSubtitles();
    await waitFor(() => expect(result.current.selectedId).toBe('track-1'));
    expect(result.current.offset).toBe(1.5);
    expect(result.current.url).toContain('/api/subtitles/tracks/track-1?streamingKey=key');

    act(() => result.current.changeOffset(-2));
    expect(readMediaSubtitles(storageKey)?.offset).toBe(-2);

    act(() => result.current.select(null));
    expect(result.current.selectedId).toBeNull();
    expect(readMediaSubtitles(storageKey)).toMatchObject({ selectedFileId: null, offset: 0 });
  });

  it('reports a failed search without stopping playback', async () => {
    searchSubtitles.mockReturnValue({ unwrap: () => Promise.reject(new Error('down')) });
    const { result } = renderSubtitles();
    await waitFor(() =>
      expect(result.current.message).toBe('Subtitle search failed. Playback can continue.')
    );
    expect(result.current.available).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});
