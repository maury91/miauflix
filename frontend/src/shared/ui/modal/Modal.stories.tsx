import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { ActionRow } from '../action-row/ActionRow';
import { Button } from '../button/Button';
import { Modal } from './Modal';

const meta = {
  title: 'Miauflix UI/Components/Modal',
  component: Modal,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Use Modal for a blocking choice with up to two button actions. Mount it only while open. Supply labelledBy matching a visible heading id and optional describedBy for supporting text. Mark the two actions with data-modal-action="0" and "1" for TV arrows. The close action, backdrop and Back/Escape request dismissal; the feature owns open state. Focus is contained among the marked buttons and restored to the opener. This modal does not support arbitrary forms or nested dialogs.',
      },
    },
  },
  args: {
    labelledBy: 'dialog-title',
    onClose: fn(),
    children: <h2 id="dialog-title">Confirm action</h2>,
  },
} satisfies Meta<typeof Modal>;
export default meta;
type Story = StoryObj<typeof meta>;
function Confirmation() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      {open && (
        <Modal
          labelledBy="confirm-title"
          describedBy="confirm-description"
          onClose={() => setOpen(false)}
        >
          <h2 id="confirm-title">Connect your account?</h2>
          <p id="confirm-description">Continue to authorize the integration.</p>
          <ActionRow>
            <Button data-modal-action="0" onClick={() => setOpen(false)}>
              Continue
            </Button>
            <Button data-modal-action="1" color="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </ActionRow>
        </Modal>
      )}
    </>
  );
}
export const ConfirmationDialog: Story = {
  render: () => <Confirmation />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const opener = canvas.getByRole('button', { name: 'Open dialog' });
    await userEvent.click(opener);
    await expect(canvas.getByRole('dialog')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Continue' })).toHaveFocus();
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
    await expect(opener).toHaveFocus();
  },
};
