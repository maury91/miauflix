import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { NavigationStage, StateCell, SurfaceStage } from '../storyHelpers';
import type { SurfaceContextValue } from '../surface';
import { Button } from './Button';

import InfoIcon from '~icons/mdi/information-outline';
import PlayIcon from '~icons/mdi/play';
import PlusIcon from '~icons/mdi/plus';

const meta = {
  title: 'Design System/Controls/Button',
  tags: ['autodocs'],
  component: Button,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'An action with a visible label. The look comes only from the surface it sits on and its state: transparent on solid surfaces and translucent over media at rest; white with black content when focused or hovered. There are no colors, tones or emphasis levels: the first action of a group is the primary one, because focus lands there first. Position it from the parent; it accepts no className or style.',
      },
    },
  },
  args: {
    children: 'Watch now',
    size: 'md',
    onClick: fn(),
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    icon: { control: false },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { icon: <PlayIcon /> },
};

function StateMatrix({ surface }: { surface: SurfaceContextValue }) {
  return (
    <SurfaceStage surface={surface}>
      <StateCell name="Rest">
        <Button icon={<PlayIcon />}>Watch now</Button>
      </StateCell>
      <StateCell name="Selected">
        <Button selected>Home</Button>
      </StateCell>
      <StateCell name="Focused">
        <Button icon={<PlayIcon />} focused>
          Watch now
        </Button>
      </StateCell>
      <StateCell name="Focused + selected">
        <Button selected focused>
          Home
        </Button>
      </StateCell>
      <StateCell name="Loading">
        <Button icon={<PlayIcon />} loading>
          Watch now
        </Button>
      </StateCell>
      <StateCell name="Loading + focused">
        <Button icon={<PlayIcon />} loading focused>
          Watch now
        </Button>
      </StateCell>
      <StateCell name="Disabled">
        <Button icon={<InfoIcon />} disabled>
          More info
        </Button>
      </StateCell>
    </SurfaceStage>
  );
}

/** Focus is virtual: the navigation layer passes `focused`; here it is set directly. */
export const StatesOnSolid: Story = {
  render: () => <StateMatrix surface="solid" />,
};

export const StatesOverMedia: Story = {
  render: () => <StateMatrix surface="overMedia" />,
};

export const Sizes: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <StateCell name="sm (web only)">
        <Button size="sm" icon={<PlayIcon />}>
          Watch now
        </Button>
      </StateCell>
      <StateCell name="md (default)">
        <Button icon={<PlayIcon />}>Watch now</Button>
      </StateCell>
      <StateCell name="lg">
        <Button size="lg" icon={<PlayIcon />}>
          Watch now
        </Button>
      </StateCell>
      <StateCell name="Focused lg">
        <Button size="lg" icon={<PlayIcon />} focused>
          Watch now
        </Button>
      </StateCell>
    </SurfaceStage>
  ),
};

export const FullWidth: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <div style={{ width: '20rem' }}>
        <Button fullWidth focused>
          Continue
        </Button>
      </div>
    </SurfaceStage>
  ),
};

export const ActivatesOnce: Story = {
  args: { icon: <PlayIcon /> },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Watch now' });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
    button.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

export const IgnoresActivationWhileLoading: Story = {
  args: { icon: <PlayIcon />, loading: true },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Watch now' });
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toBeEnabled();
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

function VirtualFocusRow({ onClick }: { onClick: () => void }) {
  return (
    <NavigationStage layout="horizontal">
      <SurfaceStage surface="overMedia">
        <Button navId="watch" size="lg" icon={<PlayIcon />} onClick={onClick}>
          Watch now
        </Button>{' '}
        <Button navId="list" size="lg" icon={<PlusIcon />} onClick={onClick}>
          My list
        </Button>{' '}
        <Button navId="info" size="lg" icon={<InfoIcon />} onClick={onClick}>
          More info
        </Button>
      </SurfaceStage>
    </NavigationStage>
  );
}

/**
 * Focus is virtual: Left/Right move it, the pointer focuses what it moves onto (there is no hover
 * look), and Confirm activates the focused button through a click.
 */
export const VirtualFocus: Story = {
  render: args => <VirtualFocusRow onClick={args.onClick as () => void} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const watch = canvas.getByRole('button', { name: 'Watch now' });
    const info = canvas.getByRole('button', { name: 'More info' });
    await expect(watch).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await expect(info).toHaveAttribute('data-focused');
    await expect(watch).not.toHaveAttribute('data-focused');
    await userEvent.keyboard('{Enter}');
    await expect(args.onClick).toHaveBeenCalledTimes(1);
    await userEvent.hover(watch);
    await expect(watch).toHaveAttribute('data-focused');
    await expect(info).not.toHaveAttribute('data-focused');
  },
};
