import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { Button } from '../button/Button';
import { TextField } from '../field/TextField';
import { Message } from '../message/Message';
import { SurfaceStage } from '../storyHelpers';
import { useStoryVirtualFocus } from '../useStoryVirtualFocus';
import { Dialog } from './Dialog';

const meta = {
  title: 'Design System/Overlays/Dialog',
  tags: ['autodocs'],
  component: Dialog,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A labelled modal overlay: title, optional description, a body that scrolls on its own, and actions with the primary one first (focus lands there). Back and a press on the scrim dismiss it when `onDismiss` is given; only the topmost dialog responds, and a field in edit mode leaves edit mode first. The navigation layer contains virtual focus in the dialog and restores the opener when it closes.',
      },
    },
  },
  args: {
    open: true,
    title: 'Remove this server?',
    actions: null,
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const page = { minHeight: '100vh', boxSizing: 'border-box', padding: '1.5rem' } as const;

function Confirmation() {
  const [open, setOpen] = useState(false);
  const [removed, setRemoved] = useState(false);
  const { focus, isFocused } = useStoryVirtualFocus(
    open ? [['close'], ['keep', 'remove']] : [['open']],
    'open'
  );
  const close = () => {
    setOpen(false);
    focus('open');
  };
  return (
    <SurfaceStage surface="solid">
      <div style={page}>
        <Button
          focused={isFocused('open')}
          onMouseMove={() => focus('open')}
          onClick={() => {
            setOpen(true);
            focus('keep');
          }}
        >
          Remove server
        </Button>
        <p style={{ color: '#a6adaf' }}>{removed ? 'Removed' : 'Not removed'}</p>
        <Dialog
          open={open}
          size="sm"
          title="Remove this server?"
          description="Its sources and download history go too. You can add it again later."
          onDismiss={close}
          closeLabel="Close"
          closeFocused={isFocused('close')}
          onCloseFocus={() => focus('close')}
          actions={
            <>
              <Button focused={isFocused('keep')} onMouseMove={() => focus('keep')} onClick={close}>
                Keep it
              </Button>
              <Button
                focused={isFocused('remove')}
                onMouseMove={() => focus('remove')}
                onClick={() => {
                  setRemoved(true);
                  close();
                }}
              >
                Remove
              </Button>
            </>
          }
        />
      </div>
    </SurfaceStage>
  );
}

/**
 * A destructive confirmation: the least destructive choice comes first and takes focus. Back,
 * the close button and the scrim dismiss it; focus returns to the opener.
 */
export const ConfirmationRecipe: Story = {
  render: () => <Confirmation />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const opener = canvas.getByRole('button', { name: 'Remove server' });
    await userEvent.keyboard('{Enter}');
    const dialog = await body.findByRole('dialog', { name: 'Remove this server?' });
    await expect(dialog).toHaveAccessibleDescription(
      'Its sources and download history go too. You can add it again later.'
    );
    await expect(within(dialog).getByRole('button', { name: 'Keep it' })).toHaveAttribute(
      'data-focused'
    );
    // Back dismisses and restores the opener
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(opener).toHaveAttribute('data-focused');
    await expect(canvas.getByText('Not removed')).toBeInTheDocument();

    await userEvent.keyboard('{Enter}');
    await body.findByRole('dialog');
    await userEvent.keyboard('{ArrowRight}{Enter}');
    await expect(canvas.getByText('Removed')).toBeInTheDocument();
  },
};

function FormDialog() {
  const [open, setOpen] = useState(true);
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Closed, only the opener can be focused; the navigation layer restores focus to it
  const { focus, isFocused } = useStoryVirtualFocus(
    open ? [['address'], ['save', 'cancel']] : [['opener']],
    'address'
  );
  const close = () => {
    setOpen(false);
    focus('opener');
  };
  return (
    <SurfaceStage surface="solid">
      <div style={page}>
        <Button
          focused={isFocused('opener')}
          onMouseMove={() => focus('opener')}
          onClick={() => {
            setOpen(true);
            focus('address');
          }}
        >
          Add server
        </Button>
        <Dialog
          open={open}
          title="Add a server"
          description="Use the address shown in the server's setup screen."
          onDismiss={close}
          actions={
            <>
              <Button
                focused={isFocused('save')}
                onMouseMove={() => focus('save')}
                onClick={() => {
                  if (!address.startsWith('http'))
                    setError('Start the address with http:// or https://.');
                  else close();
                }}
              >
                Save
              </Button>
              <Button
                focused={isFocused('cancel')}
                onMouseMove={() => focus('cancel')}
                onClick={close}
              >
                Cancel
              </Button>
            </>
          }
        >
          <TextField
            label="Server address"
            placeholder="http://192.168.1.20:3000"
            value={address}
            onChange={event => setAddress(event.target.value)}
            error={error ?? undefined}
            focused={isFocused('address')}
            onPointerFocus={() => focus('address')}
          />
        </Dialog>
      </div>
    </SurfaceStage>
  );
}

/** A form dialog: Back while typing leaves edit mode first; a second Back dismisses. */
export const FormRecipe: Story = {
  render: () => <FormDialog />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('dialog', { name: 'Add a server' });
    const input = within(dialog).getByRole('textbox', { name: 'Server address' });
    await userEvent.keyboard('{Enter}');
    await expect(input).toHaveFocus();
    await userEvent.keyboard('192.168{Escape}');
    await expect(input).not.toHaveFocus();
    await expect(body.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(
      within(dialog).getByText('Start the address with http:// or https://.')
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    // Focus is back on the opener, and Confirm reopens the form
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Add server' })).toHaveAttribute(
      'data-focused'
    );
    await userEvent.keyboard('{Enter}');
    await body.findByRole('dialog', { name: 'Add a server' });
  },
};

export const LongBody: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <div style={page}>
        <Dialog open title="What's new" actions={<Button focused>Got it</Button>}>
          <Message tone="info" variant="banner" title="Restart needed">
            Some changes apply after the app restarts.
          </Message>
          {Array.from({ length: 14 }, (_, index) => (
            <p key={index} style={{ color: '#a6adaf' }}>
              Change {index + 1}: the body scrolls on its own, so the title and the actions stay
              visible whatever the length of the text or the size of the screen.
            </p>
          ))}
        </Dialog>
      </div>
    </SurfaceStage>
  ),
};

function Nested() {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(true);
  return (
    <SurfaceStage surface="solid">
      <div style={page}>
        <p style={{ color: '#a6adaf' }}>Outer {outer ? 'open' : 'closed'}</p>
        <Dialog
          open={outer}
          title="Outer dialog"
          onDismiss={() => setOuter(false)}
          actions={<Button onClick={() => setInner(true)}>Open inner</Button>}
        />
        <Dialog
          open={outer && inner}
          size="sm"
          title="Inner dialog"
          onDismiss={() => setInner(false)}
          actions={<Button focused>OK</Button>}
        />
      </div>
    </SurfaceStage>
  );
}

/** Stacked dialogs: Back closes only the topmost, then the next. */
export const Stacked: Story = {
  render: () => <Nested />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await body.findByRole('dialog', { name: 'Inner dialog' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog', { name: 'Inner dialog' })).toBeNull());
    await expect(body.getByRole('dialog', { name: 'Outer dialog' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
  },
};
