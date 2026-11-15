import { useNavigation } from '@shared/navigation/hooks';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useLayoutEffect, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { Button } from '../button/Button';
import { NavigationStage, StateCell, SurfaceStage } from '../storyHelpers';
import type { SurfaceContextValue } from '../surface';
import { ProgressButton } from './ProgressButton';

import SkipNextIcon from '~icons/mdi/skip-next';

const meta = {
  title: 'Design System/Controls/ProgressButton',
  tags: ['autodocs'],
  component: ProgressButton,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A Button for an automatic action, such as "Next episode". It fills from left to right, from the rest look to the focused look, and runs its action when full. While it counts down it holds (virtual) focus and acts like a focused button: Confirm runs the action at once; any arrow key, or focus moving elsewhere, ends the countdown, puts it back to rest and moves focus as usual. After that it is a plain Button that never runs by itself again. The feature focuses it (`focused`) when it appears; a new countdown needs a new ProgressButton.',
      },
    },
  },
  args: {
    children: 'Next episode',
    icon: <SkipNextIcon />,
    size: 'lg',
    duration: 8000,
    onAction: fn(),
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    icon: { control: false },
  },
} satisfies Meta<typeof ProgressButton>;

export default meta;
type Story = StoryObj<typeof meta>;

function CountdownRow(props: React.ComponentProps<typeof ProgressButton>) {
  return (
    <NavigationStage layout="horizontal">
      <CountdownStage {...props} />
    </NavigationStage>
  );
}

function CountdownStage(props: React.ComponentProps<typeof ProgressButton>) {
  const [round, setRound] = useState(0);
  const [ran, setRan] = useState(0);
  const { focus } = useNavigation();
  // Virtual focus is on the progress button whenever it appears, as the feature would set it
  useLayoutEffect(() => {
    focus('progress');
  }, [round, focus]);
  return (
    <SurfaceStage surface="overMedia">
      <ProgressButton
        key={round}
        {...props}
        navId="progress"
        onAction={() => {
          setRan(count => count + 1);
          props.onAction();
        }}
      />{' '}
      <Button navId="restart" size="lg" onClick={() => setRound(value => value + 1)}>
        Restart countdown
      </Button>
      <p style={{ color: '#a6adaf', fontFamily: "'Poppins', sans-serif" }}>
        Action ran {ran} {ran === 1 ? 'time' : 'times'}. Left/Right move focus and cancel the
        countdown; Enter activates the focused button.
      </p>
    </SurfaceStage>
  );
}

export const Countdown: Story = {
  render: args => <CountdownRow {...args} />,
};

/** Frozen partway with `paused` and `initialProgress`, to compare the layers. */
function ProgressMatrix({ surface }: { surface: SurfaceContextValue }) {
  return (
    <SurfaceStage surface={surface}>
      {[0, 0.25, 0.5, 0.75, 0.99].map(progress => (
        <StateCell key={progress} name={`${Math.round(progress * 100)}%`}>
          <ProgressButton
            icon={<SkipNextIcon />}
            duration={10000}
            initialProgress={progress}
            paused
            onAction={() => undefined}
          >
            Next episode
          </ProgressButton>
        </StateCell>
      ))}
    </SurfaceStage>
  );
}

export const ProgressOverMedia: Story = {
  render: () => <ProgressMatrix surface="overMedia" />,
};

export const ProgressOnSolid: Story = {
  render: () => <ProgressMatrix surface="solid" />,
};

export const RunsWhenFull: Story = {
  args: { duration: 300, focused: true },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Next episode' });
    await waitFor(() => expect(args.onAction).toHaveBeenCalledTimes(1));
    await expect(button).not.toHaveAttribute('data-progress');
    await expect(button).toHaveAttribute('data-focused');
  },
};

export const ConfirmRunsAtOnce: Story = {
  args: { duration: 600 },
  render: args => <CountdownRow {...args} />,
  play: async ({ args }) => {
    await userEvent.keyboard('{Enter}');
    await expect(args.onAction).toHaveBeenCalledTimes(1);
    // The countdown is over: it does not run again when the time is up
    await new Promise(resolve => setTimeout(resolve, 800));
    await expect(args.onAction).toHaveBeenCalledTimes(1);
  },
};

export const ArrowCancels: Story = {
  args: { duration: 400 },
  render: args => <CountdownRow {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const next = canvas.getByRole('button', { name: 'Next episode' });
    await userEvent.keyboard('{ArrowRight}');
    await expect(next).not.toHaveAttribute('data-progress');
    await expect(canvas.getByRole('button', { name: 'Restart countdown' })).toHaveAttribute(
      'data-focused'
    );
    await new Promise(resolve => setTimeout(resolve, 600));
    await expect(args.onAction).not.toHaveBeenCalled();
    // Back on it, it is a plain button
    await userEvent.keyboard('{ArrowLeft}');
    await expect(next).toHaveAttribute('data-focused');
    await userEvent.keyboard('{Enter}');
    await expect(args.onAction).toHaveBeenCalledTimes(1);
  },
};
