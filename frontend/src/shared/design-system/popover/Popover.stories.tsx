import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import { useFocusable } from '@shared/navigation/hooks';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../button/Button';
import { IconButton } from '../icon-button/IconButton';
import { Stack } from '../layout/Stack';
import { OptionList } from '../option-list/OptionList';
import { NavigationStage, SurfaceStage } from '../storyHelpers';
import { color, fontFamily, typeScale } from '../tokens';
import { Popover } from './Popover';

import AudioIcon from '~icons/mdi/volume-high';

const meta = {
  title: 'Design System/Overlays/Popover',
  tags: ['autodocs'],
  component: Popover,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'An interactive panel next to its trigger, raised with the one overlay shadow so it reads over artwork. The feature controls `open`; Back, a press outside and (non-modal) Tab leaving it call `onDismiss`. The policy is named: `modal` contains (Tab cycles inside, an outside press closes without acting, the navigation layer keeps virtual focus inside), `nonModal` lets go (an outside press closes and still acts). Its content is a child group; DOM focus moves to the panel and returns to the trigger. Placed without measuring, by `placement` and `align`.',
      },
    },
  },
  args: {
    open: false,
    onDismiss: () => undefined,
    modality: 'modal',
    title: 'Audio',
    trigger: () => null,
    children: null,
  },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

const tracks = [
  { value: 'en', label: 'English · 5.1' },
  { value: 'it', label: 'Italian · Stereo' },
  { value: 'ja', label: 'Japanese · Stereo' },
];

/**
 * The track list as one navigation leaf: its active option shows only while it holds focus. While
 * focused it owns Up/Down between its tracks (the layer takes over past either end) and Confirm.
 */
function TrackList({ value, onSelect }: { value: string; onSelect: (value: string) => void }) {
  const nav = useFocusable<HTMLDivElement>('list');
  const [active, setActive] = useState(value);
  const latest = useRef({ active, onSelect });
  latest.current = { active, onSelect };
  useEffect(() => {
    if (!nav.focused) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const keyAction = getKeyboardAction(event);
      if (keyAction === 'up' || keyAction === 'down') {
        const index = tracks.findIndex(track => track.value === latest.current.active);
        const next = tracks[index + (keyAction === 'down' ? 1 : -1)];
        if (!next) return;
        event.preventDefault();
        event.stopPropagation();
        setActive(next.value);
      } else if (keyAction === 'confirm') {
        event.preventDefault();
        event.stopPropagation();
        latest.current.onSelect(latest.current.active);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [nav.focused]);
  return (
    <div ref={nav.ref} onMouseMove={nav.onMouseMove}>
      <OptionList
        id="audio-tracks"
        labelledBy="audio-tracks-label"
        items={tracks}
        value={value}
        activeValue={nav.focused ? active : null}
        onSelect={onSelect}
        onPointerActivate={setActive}
      />
    </div>
  );
}

function AudioPopover() {
  const [open, setOpen] = useState(false);
  const [track, setTrack] = useState('en');
  const [nextPresses, setNextPresses] = useState(0);

  return (
    <NavigationStage layout="horizontal" initialId="audio">
      <div style={{ minHeight: '20rem' }}>
        <Stack direction="row" gap="sm" align="center">
          <Popover
            open={open}
            // The navigation layer enters the popover's content and restores the trigger on close
            onDismiss={() => setOpen(false)}
            modality="modal"
            title="Audio"
            size="sm"
            trigger={triggerProps => (
              <IconButton
                {...triggerProps}
                label="Audio"
                icon={<AudioIcon />}
                navId="audio"
                onClick={() => setOpen(value => !value)}
              />
            )}
          >
            <Stack gap="sm">
              <TrackList value={track} onSelect={setTrack} />
              <span id="audio-tracks-label" hidden>
                Audio tracks
              </span>
              <Button fullWidth navId="done" onClick={() => setOpen(false)}>
                Done
              </Button>
            </Stack>
          </Popover>
          <Button navId="next" onClick={() => setNextPresses(count => count + 1)}>
            Next episode
          </Button>
        </Stack>
        <p style={{ color: color.textSecondary, fontFamily, fontSize: typeScale.caption.fontSize }}>
          {`Track: ${track} · Next episode pressed: ${nextPresses}`}
        </p>
      </div>
    </NavigationStage>
  );
}

/**
 * Modal: Confirm on the trigger opens it and the navigation layer enters its content; Back closes
 * it and restores the trigger. A press outside closes it without pressing what is underneath.
 */
export const Modal: Story = {
  render: () => (
    <SurfaceStage surface="overMedia">
      <AudioPopover />
    </SurfaceStage>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Audio' });
    await userEvent.keyboard('{Enter}');
    const panel = canvas.getByRole('dialog', { name: 'Audio' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toHaveFocus();
    // The layer entered the content at the track list; Down walks the tracks, reaches Done and
    // stays inside
    await expect(canvas.getByRole('option', { name: 'English · 5.1' })).toHaveAttribute(
      'data-active'
    );
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await expect(canvas.getByRole('option', { name: 'Japanese · Stereo' })).toHaveAttribute(
      'data-active'
    );
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await expect(canvas.getByRole('button', { name: 'Done' })).toHaveAttribute('data-focused');
    await userEvent.keyboard('{Escape}');
    await expect(canvas.queryByRole('dialog')).toBeNull();
    await expect(trigger).toHaveAttribute('data-focused');
    await expect(trigger).toHaveFocus();

    // The tracks by keys: Down moves through them, Confirm selects one
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('option', { name: 'English · 5.1' })).toHaveAttribute(
      'data-active'
    );
    await userEvent.keyboard('{ArrowDown}{Enter}');
    const italian = canvas.getByRole('option', { name: 'Italian · Stereo' });
    await expect(italian).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByText(/Track: it/)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    // An outside press closes it and does not reach the button underneath
    await userEvent.click(trigger);
    await userEvent.click(canvas.getByRole('button', { name: 'Next episode' }));
    await expect(canvas.queryByRole('dialog')).toBeNull();
    await expect(canvas.getByText(/Next episode pressed: 0/)).toBeInTheDocument();
  },
};

function QuickSettings() {
  const [open, setOpen] = useState(false);
  const [presses, setPresses] = useState(0);
  return (
    <div style={{ minHeight: '14rem' }}>
      <Stack direction="row" gap="sm" justify="between">
        <Button onClick={() => setPresses(count => count + 1)}>{`Pressed ${presses}`}</Button>
        <Popover
          open={open}
          onDismiss={() => setOpen(false)}
          modality="nonModal"
          title="Playback speed"
          align="end"
          trigger={triggerProps => (
            <Button {...triggerProps} onClick={() => setOpen(value => !value)}>
              Speed
            </Button>
          )}
        >
          <p style={{ margin: 0, color: color.textSecondary, fontFamily }}>
            Non-modal: pressing elsewhere closes it and still acts. It lines up with the
            trigger&apos;s end edge.
          </p>
        </Popover>
      </Stack>
    </div>
  );
}

/** Non-modal, aligned to the trigger's end: a press outside closes it and still acts. */
export const NonModal: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <QuickSettings />
    </SurfaceStage>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Speed' }));
    await expect(canvas.getByRole('dialog', { name: 'Playback speed' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Pressed 0' }));
    await expect(canvas.queryByRole('dialog')).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Pressed 1' })).toBeVisible();
  },
};
