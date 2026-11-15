import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { Button } from '../button/Button';
import { Inline } from '../layout/Inline';
import { SurfaceStage } from '../storyHelpers';
import { type Notification, NotificationRegion } from './NotificationRegion';

const meta = {
  title: 'Design System/Feedback/NotificationRegion',
  tags: ['autodocs'],
  component: NotificationRegion,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Transient messages over the screen, bottom (or top) centre. It owns their lifecycle (each expires after its duration, 5 s by default, and the feature removes it) and how they are announced: once, politely unless `urgent`, through live regions that exist before anything arrives. Message owns the look. It never takes focus or the pointer, so notifications hold no actions; anything a user must act on belongs in the screen or a Dialog.',
      },
    },
  },
  args: { label: 'Notifications', notifications: [], onExpire: () => undefined },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <div style={{ minHeight: '16rem' }}>
          <Story />
        </div>
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof NotificationRegion>;

export default meta;
type Story = StoryObj<typeof NotificationRegion>;

function Demo() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [count, setCount] = useState(0);
  const add = (notification: Omit<Notification, 'id'>) => {
    setCount(value => value + 1);
    setNotifications(current => [...current, { ...notification, id: `n${count}` }]);
  };
  return (
    <>
      <Inline gap="sm">
        <Button
          onClick={() =>
            add({ tone: 'success', body: 'Saved. The new server is in use.', duration: 1500 })
          }
        >
          Saved
        </Button>
        <Button
          onClick={() =>
            add({
              tone: 'danger',
              toneLabel: 'Error',
              title: 'Connection lost',
              body: 'Playback stopped. Check the server and try again.',
              urgent: true,
              duration: null,
            })
          }
        >
          Connection lost
        </Button>
      </Inline>
      <NotificationRegion
        label="Notifications"
        notifications={notifications}
        onExpire={id => setNotifications(current => current.filter(item => item.id !== id))}
      />
    </>
  );
}

/** Each is announced once; the polite one expires, the urgent one stays until removed. */
export const Lifecycle: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const status = canvas.getByRole('status', { name: 'Notifications' });
    const alert = canvas.getByRole('alert', { name: 'Notifications' });
    const shown = () => canvasElement.querySelectorAll('[data-placement] > *').length;
    await userEvent.click(canvas.getByRole('button', { name: 'Saved' }));
    await expect(status).toHaveTextContent('Saved. The new server is in use.');
    await expect(shown()).toBe(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Connection lost' }));
    await expect(alert).toHaveTextContent(
      'Error. Connection lost. Playback stopped. Check the server and try again.'
    );
    // The polite one is not announced again when another arrives
    await expect(status).toHaveTextContent('Saved. The new server is in use.');
    // Never takes focus
    await expect(canvas.getByRole('button', { name: 'Connection lost' })).toHaveFocus();
    // The polite one expires; the urgent one stays until the feature removes it
    await waitFor(() => expect(shown()).toBe(1), { timeout: 3000 });
    await expect(canvasElement.querySelector('[data-placement]')).toHaveTextContent(
      'Connection lost'
    );
  },
};
