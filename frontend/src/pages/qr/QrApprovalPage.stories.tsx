import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';

import QrApprovalPage from './QrApprovalPage';

const TV_AGENT =
  'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106/5.5 TV Safari/537.36';
const user = { id: 'user-1', email: 'test@example.com', displayName: 'Test', role: 'user' };

/** Answers the page's requests: the sign-in request is `state`; approving or declining succeeds. */
const stubRequests = (state: string) => {
  const original = globalThis.fetch;
  globalThis.fetch = (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = /\/(approve|reject)$/.test(url)
      ? { state: url.endsWith('/approve') ? 'approved' : 'rejected' }
      : {
          state,
          expiresAt: new Date(Date.now() + 240_000).toISOString(),
          device: { userAgent: TV_AGENT },
        };
    return Promise.resolve(
      new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
    );
  };
  return () => {
    globalThis.fetch = original;
  };
};

const withSession = (Story: () => React.ReactElement) => {
  const store = configureStore({
    reducer: { auth: authSlice.reducer },
    preloadedState: {
      auth: { currentSessionId: 'phone', availableSessions: [], currentUser: user as never },
    },
  });
  return (
    <Provider store={store}>
      <Story />
    </Provider>
  );
};

const meta = {
  title: 'Settings/QR Approval',
  component: QrApprovalPage,
  args: { approvalToken: 'approval-token' },
  decorators: [withSession],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof QrApprovalPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A TV is waiting: approve or decline it with this browser's profile. */
export const Pending: Story = { beforeEach: () => stubRequests('pending') };

/** The request was approved. */
export const Approved: Story = { beforeEach: () => stubRequests('approved') };

/** The code ran out before anyone answered. */
export const Expired: Story = { beforeEach: () => stubRequests('expired') };
