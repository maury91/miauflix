import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TraktAuthorization } from './TraktAuthorization';

const setupTest = (lifetime: number) =>
  render(
    <TraktAuthorization
      authorization={{
        authorizationId: 'device-id',
        userCode: 'ABCD',
        verificationUrl: 'https://trakt.tv/activate',
        interval: 2,
        expiresAt: new Date(Date.now() + lifetime).toISOString(),
      }}
      activationUrl="https://trakt.tv/activate/ABCD"
      error={null}
      copied={false}
      onCopyCode={vi.fn()}
    />
  );

describe('Trakt authorization expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows remaining time and stops at expiration', () => {
    setupTest(62000);
    expect(screen.getByRole('timer')).toHaveTextContent('Code expires in 1:02');
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('timer')).toHaveTextContent('Code expires in 1:00');
    act(() => vi.advanceTimersByTime(60000));
    expect(screen.getByRole('timer')).toHaveTextContent('Code expired');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the actual deadline after a clock jump and cleans up on unmount', () => {
    const { unmount } = setupTest(62000);
    vi.setSystemTime(new Date('2026-10-04T12:01:00Z'));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('timer')).toHaveTextContent('Code expires in 0:01');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows an already expired code without starting a timer', () => {
    setupTest(-1000);
    expect(screen.getByRole('timer')).toHaveTextContent('Code expired');
    expect(vi.getTimerCount()).toBe(0);
  });
});
