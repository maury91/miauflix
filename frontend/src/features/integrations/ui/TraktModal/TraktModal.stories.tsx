import { NavigationStage } from '@shared/design-system/storyHelpers';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';

import { TraktModal } from './TraktModal';

const meta = {
  title: 'Home/Trakt Modal',
  component: TraktModal,
  parameters: { layout: 'fullscreen' },
  // On Home the dialog sits under Home's navigation layer
  decorators: [
    Story => (
      <NavigationStage>
        <Story />
      </NavigationStage>
    ),
  ],
  args: {
    sessionId: 'storybook-session',
    onConnected: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof TraktModal>;

export default meta;
type Story = StoryObj<typeof meta>;

const focusedName = () => {
  const element = document.querySelector('[data-focused]');
  return element?.getAttribute('aria-label') ?? element?.textContent ?? null;
};

/** Starts on the first action; the edges stop and Up reaches the close button. */
export const Landing: Story = {
  play: async () => {
    // The dialog is in a portal, outside the canvas
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await waitFor(() => expect(focusedName()).toBe('Connect Trakt'));
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await expect(focusedName()).toBe('Don’t ask again');
    await userEvent.keyboard('{ArrowUp}');
    await expect(focusedName()).toBe('Close Trakt dialog');
    await userEvent.keyboard('{ArrowUp}{ArrowDown}');
    await expect(focusedName()).toBe('Don’t ask again');
    await userEvent.keyboard('{ArrowLeft}');
    await expect(focusedName()).toBe('Connect Trakt');
  },
};
