import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../../button/Button';
import { Message } from '../../message/Message';
import { InitialFocus, NavigationStage, StateCell, SurfaceStage } from '../../storyHelpers';
import { PairingPanel } from './PairingPanel';

const meta = {
  title: 'Design System/Product Patterns/PairingPanel',
  tags: ['autodocs'],
  component: PairingPanel,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Pairing another device: a code to scan on a white tile (the QR code needs a light quiet zone), a code to type, how long it lasts and what to do once it runs out. Layout only: the auth feature draws the QR code, requests codes, polls and counts down, and passes the state in. The typed code is spelled out for assistive technology; the countdown is not a live region.',
      },
    },
  },
  args: { title: 'Sign in with your phone', state: 'loading', loadingLabel: 'Getting a code' },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof PairingPanel>;

export default meta;
type Story = StoryObj<typeof PairingPanel>;

/** A stand-in for the QR code the auth feature draws (react-qr-code). */
function FakeQr() {
  return (
    <svg viewBox="0 0 21 21" width="100%" height="100%" role="img" aria-label="Sign-in QR code">
      {Array.from({ length: 120 }, (_, index) => (
        <rect
          key={index}
          x={(index * 7) % 21}
          y={Math.floor((index * 7) / 21) % 21}
          width="1"
          height="1"
        />
      ))}
      <rect x="0" y="0" width="7" height="7" fill="none" stroke="black" strokeWidth="1.5" />
      <rect x="14" y="0" width="7" height="7" fill="none" stroke="black" strokeWidth="1.5" />
      <rect x="0" y="14" width="7" height="7" fill="none" stroke="black" strokeWidth="1.5" />
    </svg>
  );
}

const shared = {
  title: 'Sign in with your phone',
  instructions: 'Scan the code, or go to miauwatch.tv/pair and type it.',
  loadingLabel: 'Getting a code',
  userCodeLabel: 'Code',
};

export const States: Story = {
  // Several panels side by side share a name; on a page there is one
  parameters: { a11y: { config: { rules: [{ id: 'landmark-unique', enabled: false }] } } },
  render: () => (
    <div>
      <StateCell name="Loading">
        <div style={{ width: '22rem' }}>
          <PairingPanel {...shared} state="loading" />
        </div>
      </StateCell>
      <StateCell name="Ready">
        <div style={{ width: '22rem' }}>
          <PairingPanel
            {...shared}
            state="ready"
            qr={<FakeQr />}
            userCode="K7QD-2MXP"
            status="Expires in 4:32"
          />
        </div>
      </StateCell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('Getting a code');
    // Spelled out for assistive technology
    await expect(canvas.getByText('Code: K 7 Q D - 2 M X P')).toBeInTheDocument();
    await expect(canvas.getByRole('img', { name: 'Sign-in QR code' })).toBeVisible();
  },
};

function Expiring() {
  const [expired, setExpired] = useState(true);
  return (
    <NavigationStage>
      <div style={{ width: '22rem' }}>
        <PairingPanel
          {...shared}
          state={expired ? 'expired' : 'ready'}
          qr={<FakeQr />}
          userCode={expired ? 'K7QD-2MXP' : 'R2VN-8TLC'}
          status={expired ? undefined : 'Expires in 5:00'}
          message={expired ? <Message tone="warning">This code expired.</Message> : undefined}
          actions={
            expired ? (
              <Button navId="new-code" onClick={() => setExpired(false)}>
                Get a new code
              </Button>
            ) : undefined
          }
        />
      </div>
      {expired && <InitialFocus id="new-code" />}
    </NavigationStage>
  );
}

/** Once the code expires the feature offers a new one; the old code fades behind the message. */
export const Expired: Story = {
  render: () => <Expiring />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('This code expired.')).toBeVisible();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByText('Expires in 5:00')).toBeVisible();
    await expect(canvas.getByText('Code: R 2 V N - 8 T L C')).toBeInTheDocument();
  },
};
