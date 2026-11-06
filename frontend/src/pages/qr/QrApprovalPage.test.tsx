import { configureStore } from '@reduxjs/toolkit';
import { addSession, authSlice } from '@store/slices/auth';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@features/auth/ui/login/LoginWithEmail', () => ({
  LoginWithEmail: () => <div data-testid="login-with-email" />,
}));

import QrApprovalPage from './QrApprovalPage';

const TV_AGENT =
  'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106/5.5 TV Safari/537.36';
const user = { id: 'user-1', email: 'test@example.com', displayName: 'Test', role: 'user' };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const setupTest = ({
  signedIn = true,
  availableSessions = [],
  request = { state: 'pending', expiresAt: new Date(Date.now() + 120_000).toISOString() },
  approve = json({ state: 'approved' }),
}: {
  signedIn?: boolean;
  availableSessions?: { session: string; user: typeof user }[];
  request?: object;
  approve?: Response;
} = {}) => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/approve') || url.endsWith('/reject')) return Promise.resolve(approve);
    return Promise.resolve(json({ ...request, device: { userAgent: TV_AGENT } }));
  });
  vi.stubGlobal('fetch', fetchMock);
  const store = configureStore({
    reducer: { auth: authSlice.reducer },
    preloadedState: {
      auth: signedIn
        ? { currentSessionId: 'phone', availableSessions: [], currentUser: user as never }
        : {
            currentSessionId: null,
            availableSessions: availableSessions as never,
            currentUser: null,
          },
    },
  });
  render(
    <Provider store={store}>
      <QrApprovalPage approvalToken="approval-token" />
    </Provider>
  );
  return { fetchMock, store };
};

const approvalCall = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.find((call: unknown[]) =>
    String(call[0] instanceof Request ? call[0].url : call[0]).endsWith('/approve')
  );

const requestHeaders = (call: unknown[]): Headers => {
  const [input, init] = call as [RequestInfo | URL, RequestInit | undefined];
  return new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
};

describe('QrApprovalPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the device and approves it with this browser session', async () => {
    const { fetchMock } = setupTest();
    expect(await screen.findByText('Samsung TV')).toBeInTheDocument();
    expect(screen.getByText(/Code expires in \d:\d\d/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('heading', { name: 'Approved' })).toBeInTheDocument();
    const approval = fetchMock.mock.calls.find((call: unknown[]) =>
      String(call[0] instanceof Request ? call[0].url : call[0]).endsWith('/approve')
    );
    expect(approval).toBeDefined();
    expect(requestHeaders(approval!).get('X-Session-Id')).toBe('phone');
  });

  it('declines the device', async () => {
    setupTest({ approve: json({ state: 'rejected' }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    expect(await screen.findByRole('heading', { name: 'Sign-in declined' })).toBeInTheDocument();
  });

  it('asks to sign in first, showing which device is waiting', async () => {
    setupTest({ signedIn: false });
    expect(await screen.findByRole('heading', { name: 'Sign in to continue' })).toBeInTheDocument();
    expect(screen.getByText('Samsung TV')).toBeInTheDocument();
    expect(screen.getByTestId('login-with-email')).toBeInTheDocument();
  });

  it('approves with the only signed-in profile when this tab has not chosen one', async () => {
    const { fetchMock } = setupTest({
      signedIn: false,
      availableSessions: [{ session: 'stored', user }],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('heading', { name: 'Approved' })).toBeInTheDocument();
    expect(requestHeaders(approvalCall(fetchMock)!).get('X-Session-Id')).toBe('stored');
  });

  it('offers approval once signing in here adds a profile', async () => {
    const { store } = setupTest({ signedIn: false });
    expect(await screen.findByRole('heading', { name: 'Sign in to continue' })).toBeInTheDocument();
    act(() => {
      store.dispatch(addSession({ session: 'new', user: user as never }));
    });
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('asks which profile approves when several are signed in', async () => {
    const other = { ...user, id: 'user-2', displayName: 'Other' };
    const { fetchMock } = setupTest({
      signedIn: false,
      availableSessions: [
        { session: 'first', user },
        { session: 'second', user: other },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Other' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('heading', { name: 'Approved' })).toBeInTheDocument();
    expect(requestHeaders(approvalCall(fetchMock)!).get('X-Session-Id')).toBe('second');
  });

  it('explains an expired or unknown code', async () => {
    setupTest({ request: { state: 'expired' } });
    expect(
      await screen.findByRole('heading', { name: 'This code has expired' })
    ).toBeInTheDocument();
  });

  it('shows the current state when the request changed meanwhile', async () => {
    const { fetchMock } = setupTest({ approve: json({ error: 'no longer pending' }, 409) });
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
});
