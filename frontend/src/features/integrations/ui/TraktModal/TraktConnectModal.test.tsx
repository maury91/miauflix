import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { beginAuthorization, pollAuthorization } = vi.hoisted(() => ({
  beginAuthorization: vi.fn(),
  pollAuthorization: vi.fn(),
}));

vi.mock('@features/integrations/api/trakt.api', () => ({
  beginTraktAssociation: beginAuthorization,
  pollTraktAssociation: pollAuthorization,
}));

vi.mock('react-qr-code', () => ({
  default: ({ value, ...props }: { value: string }) => <svg data-value={value} {...props} />,
}));

import { TraktModal } from './TraktModal';

const setupTest = () => {
  const onDismiss = vi.fn();
  const onConnected = vi.fn();
  const backgroundKeyDown = vi.fn();
  const view = render(
    <div onKeyDown={backgroundKeyDown}>
      <TraktModal sessionId="test-session" onConnected={onConnected} onDismiss={onDismiss} />
    </div>
  );
  return { ...view, onDismiss, backgroundKeyDown };
};

describe('Trakt dialog dismissal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('moves arrows between columns and rows without cycling through X', () => {
    const { backgroundKeyDown } = setupTest();
    const first = screen.getByRole('button', { name: "Let's go" });
    const never = screen.getByRole('button', { name: 'Don’t ask again' });
    const close = screen.getByRole('button', { name: 'Close Trakt dialog' });
    for (const key of ['ArrowLeft', 'ArrowRight']) {
      first.focus();
      fireEvent.keyDown(first, { key });
      expect(never).toHaveFocus();
      fireEvent.keyDown(never, { key });
      expect(first).toHaveFocus();
    }
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(close).toHaveFocus();
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) {
      fireEvent.keyDown(close, { key });
      expect(close).toHaveFocus();
    }
    fireEvent.keyDown(close, { key: 'ArrowDown' });
    expect(first).toHaveFocus();
    never.focus();
    fireEvent.keyDown(never, { key: 'ArrowDown' });
    expect(never).toHaveFocus();
    fireEvent.keyDown(never, { key: 'ArrowUp' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'ArrowDown' });
    expect(never).toHaveFocus();
    expect(backgroundKeyDown).not.toHaveBeenCalled();
  });

  it('replaces Not now with an accessible X button', () => {
    const { onDismiss } = setupTest();
    expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Trakt dialog' }));
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('closes only when the overlay itself is clicked', () => {
    const { onDismiss } = setupTest();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(screen.getByRole('heading', { name: 'Connect Trakt' }));
    fireEvent.click(dialog);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(dialog.parentElement!);
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each([
    { key: 'Escape' },
    { key: 'Backspace' },
    { key: 'Back' },
    { key: 'BrowserBack' },
    { key: 'GoBack' },
    { key: 'Unidentified', keyCode: 10009 },
    { key: 'Unidentified', keyCode: 461 },
  ])('closes temporarily for Back event %j without reaching home navigation', event => {
    const { onDismiss, backgroundKeyDown, unmount } = setupTest();
    expect(fireEvent.keyDown(document.activeElement!, { ...event, cancelable: true })).toBe(false);
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith(false);
    expect(backgroundKeyDown).not.toHaveBeenCalled();
    unmount();
    expect(fireEvent.keyDown(document, { ...event, cancelable: true })).toBe(true);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('also receives TV Back when focus is outside the dialog', () => {
    const { onDismiss } = setupTest();
    fireEvent.keyDown(document, { keyCode: 10009, cancelable: true });
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('keeps X, outside click, and TV Back available during authorization', async () => {
    beginAuthorization.mockResolvedValue({
      data: {
        authorizationId: 'device-id',
        userCode: 'ABCD',
        verificationUrl: 'https://trakt.tv/activate',
        interval: 1000,
      },
    });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { onDismiss } = setupTest();
    try {
      fireEvent.click(screen.getByRole('button', { name: "Let's go" }));
      const openButton = await screen.findByRole('button', { name: 'Open Trakt' });
      expect(open).not.toHaveBeenCalled();
      expect(screen.getByText('ABCD')).toBeInTheDocument();
      expect(screen.getByText('Scan the QR code')).toBeInTheDocument();
      expect(screen.getByLabelText('Scan to connect your Trakt account')).toHaveAttribute(
        'data-value',
        'https://trakt.tv/activate/ABCD'
      );
      fireEvent.click(openButton);
      expect(open).toHaveBeenCalledExactlyOnceWith(
        'https://trakt.tv/activate/ABCD',
        '_blank',
        'noopener,noreferrer'
      );
      await waitFor(() => expect(screen.getByRole('button', { name: 'Open Trakt' })).toHaveFocus());
      fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
      expect(screen.getByRole('button', { name: 'Copy Trakt code' })).toHaveFocus();
      fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
      expect(screen.getByRole('button', { name: 'Close Trakt dialog' })).toHaveFocus();
      fireEvent.click(screen.getByRole('button', { name: 'Close Trakt dialog' }));
      fireEvent.click(screen.getByRole('dialog').parentElement!);
      fireEvent.keyDown(document, { keyCode: 10009 });
      expect(onDismiss).toHaveBeenCalledTimes(3);
      expect(onDismiss.mock.calls).toEqual([[false], [false], [false]]);
    } finally {
      open.mockRestore();
    }
  });
  it('copies the authorization code and announces success', async () => {
    beginAuthorization.mockResolvedValue({
      data: {
        authorizationId: 'device-id',
        userCode: 'ABCD',
        verificationUrl: 'https://trakt.tv/activate',
        interval: 1000,
      },
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    setupTest();
    fireEvent.click(screen.getByRole('button', { name: "Let's go" }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy Trakt code' }));
    expect(writeText).toHaveBeenCalledExactlyOnceWith('ABCD');
    expect(await screen.findByText('Code copied')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for authorization...')).not.toBeInTheDocument();
  });

  it('connects after a successful authorization poll', async () => {
    beginAuthorization.mockResolvedValue({
      data: {
        authorizationId: 'device-id',
        userCode: 'ABCD',
        verificationUrl: 'https://trakt.tv/activate',
        interval: 0.001,
      },
    });
    pollAuthorization.mockResolvedValue({ data: { state: 'connected' } });
    const onConnected = vi.fn();
    const view = render(
      <TraktModal sessionId="test-session" onConnected={onConnected} onDismiss={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: "Let's go" }));
    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1), { timeout: 7000 });
    expect(pollAuthorization).toHaveBeenCalledExactlyOnceWith('device-id', 'test-session');
    view.unmount();
  }, 10000);
});
