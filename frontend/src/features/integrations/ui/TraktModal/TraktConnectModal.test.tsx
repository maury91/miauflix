import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { FocusScope, NavigationProvider } from '@shared/navigation';

import { TraktModal } from './TraktModal';

const cleanups: (() => void)[] = [];

const setupTest = () => {
  const onDismiss = vi.fn();
  const onConnected = vi.fn();
  // Home's own keys listen on the window, after the dialog's
  const backgroundKeyDown = vi.fn();
  window.addEventListener('keydown', backgroundKeyDown);
  // As on Home: the dialog sits under the page's navigation layer
  const view = render(
    <NavigationProvider>
      <FocusScope>
        <TraktModal sessionId="test-session" onConnected={onConnected} onDismiss={onDismiss} />
      </FocusScope>
    </NavigationProvider>
  );
  cleanups.push(() => window.removeEventListener('keydown', backgroundKeyDown));
  return { ...view, onDismiss, backgroundKeyDown };
};

const press = (key: string) => fireEvent.keyDown(document.activeElement ?? document, { key });

describe('Trakt dialog dismissal', () => {
  beforeEach(() => {
    // Not resetAllMocks: that would also reset the test setup's matchMedia
    beginAuthorization.mockReset();
    pollAuthorization.mockReset();
    // jsdom lays nothing out: give every element a box, so the navigation layer can focus it
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      () => [{}] as unknown as DOMRectList
    );
  });
  afterEach(() => {
    vi.mocked(Element.prototype.getClientRects).mockRestore();
    cleanups.splice(0).forEach(cleanup => cleanup());
  });

  // The dialog's edges and the move up to the close button depend on layout, which jsdom lacks:
  // the story covers them
  it('starts on the first action and moves between the actions', () => {
    setupTest();
    const first = screen.getByRole('button', { name: "Let's go" });
    const never = screen.getByRole('button', { name: 'Don’t ask again' });
    expect(first).toHaveAttribute('data-focused');
    press('ArrowRight');
    expect(never).toHaveAttribute('data-focused');
    press('ArrowLeft');
    expect(first).toHaveAttribute('data-focused');
  });

  it('replaces Not now with an accessible X button', () => {
    const { onDismiss } = setupTest();
    expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Trakt dialog' }));
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('closes only when the scrim itself is pressed', () => {
    const { onDismiss } = setupTest();
    const dialog = screen.getByRole('dialog');
    fireEvent.mouseDown(screen.getByRole('heading', { name: 'Connect Trakt' }));
    fireEvent.mouseDown(dialog);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseDown(dialog.parentElement!);
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each([
    { key: 'Escape' },
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
      expect(screen.getByRole('button', { name: 'Open Trakt' })).toHaveAttribute('data-focused');
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
      press('ArrowRight');
      expect(screen.getByRole('button', { name: 'Copy code' })).toHaveAttribute('data-focused');
      fireEvent.click(screen.getByRole('button', { name: 'Close Trakt dialog' }));
      fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
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
    await screen.findByRole('button', { name: 'Copy code' });
    press('ArrowRight');
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledExactlyOnceWith('ABCD');
    expect(await screen.findByText('Code copied')).toBeInTheDocument();
    // Copying re-renders the dialog: focus stays on Copy code
    expect(screen.getByRole('button', { name: /Copy code|Code copied/ })).toHaveAttribute(
      'data-focused'
    );
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
