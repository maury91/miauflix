import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetMissingProfilePictures,
  useMissingProfilePictures,
} from './useMissingProfilePictures';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  initiate: vi.fn((request: unknown) => ({ type: 'upload', request })),
  render: vi.fn(),
  live: vi.fn(() => true),
}));

vi.mock('@store/hooks', () => ({ useAppDispatch: () => mocks.dispatch }));
vi.mock('../api/profiles.api', () => ({
  profilesApi: { endpoints: { uploadProfilePicture: { initiate: mocks.initiate } } },
}));
vi.mock('./runtime', () => ({ liveAvatarsSupported: mocks.live }));
vi.mock('./snapshot', () => ({ renderPlushieSnapshot: mocks.render }));

const profile = (id: string, avatarVersion: number | null) => ({
  session: `session-${id}`,
  user: {
    id,
    email: `${id}@example.com`,
    displayName: id,
    role: 'user' as const,
    avatar: { kind: 'pill', color: '#a65ce8' },
    avatarVersion,
  },
});

describe('useMissingProfilePictures', () => {
  beforeEach(() => {
    resetMissingProfilePictures();
    mocks.render.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    mocks.live.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a picture for each profile whose look has none, once', async () => {
    const profiles = [profile('a', null), profile('b', 1700000000000), profile('c', null)];
    const { rerender } = renderHook(({ list }) => useMissingProfilePictures(list), {
      initialProps: { list: profiles },
    });

    await waitFor(() => expect(mocks.initiate).toHaveBeenCalledTimes(2));
    expect(mocks.initiate).toHaveBeenCalledWith(expect.objectContaining({ session: 'session-a' }));
    expect(mocks.initiate).toHaveBeenCalledWith(expect.objectContaining({ session: 'session-c' }));

    rerender({ list: [...profiles] });
    await Promise.resolve();
    expect(mocks.render).toHaveBeenCalledTimes(2);
  });

  it('leaves it to devices that can draw Plushies', async () => {
    mocks.live.mockReturnValue(false);
    renderHook(() => useMissingProfilePictures([profile('a', null)]));
    await Promise.resolve();
    expect(mocks.render).not.toHaveBeenCalled();
  });
});
