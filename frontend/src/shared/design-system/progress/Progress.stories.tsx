import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, within } from 'storybook/test';

import { Button } from '../button/Button';
import { StateCell, SurfaceStage } from '../storyHelpers';
import { ProgressBar, ProgressSpinner } from './Progress';

const meta = {
  title: 'Design System/Feedback/Progress',
  tags: ['autodocs'],
  component: ProgressSpinner,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'An indeterminate spinner (the animated icon in the current text color) and a determinate bar (brand color, filled by `scaleX`, so updates only composite). Each is explicitly labelled (status semantics: `status` or `progressbar`, announced once) or decorative (hidden, because something else already says it, like a busy button). Value text is formatted by the feature.',
      },
    },
  },
  args: { label: 'Loading sources' },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof ProgressSpinner>;

export default meta;
type Story = StoryObj<typeof ProgressSpinner>;

export const Spinners: Story = {
  render: () => (
    <>
      <StateCell name="sm">
        <ProgressSpinner decorative size="sm" />
      </StateCell>
      <StateCell name="md">
        <ProgressSpinner decorative />
      </StateCell>
      <StateCell name="lg">
        <ProgressSpinner decorative size="lg" />
      </StateCell>
      <StateCell name="Labelled, shown">
        <ProgressSpinner label="Loading sources" showLabel />
      </StateCell>
      <StateCell name="In a busy button (decorative)">
        <Button loading>Testing connection</Button>
      </StateCell>
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
    await expect(canvas.getByRole('status')).toHaveTextContent('Loading sources');
  },
};

function LiveBar() {
  const [value, setValue] = useState(0.15);
  useEffect(() => {
    const timer = setInterval(() => setValue(current => (current >= 1 ? 0 : current + 0.05)), 400);
    return () => clearInterval(timer);
  }, []);
  return (
    <ProgressBar
      label="Downloading Dune: Part Two"
      value={value}
      valueText={`${Math.round(value * 100)}%`}
      showLabel
      size="lg"
    />
  );
}

export const Bars: Story = {
  render: () => (
    <div style={{ maxWidth: '24rem' }}>
      <StateCell name="Labelled, shown, live">
        <div style={{ width: '24rem' }}>
          <LiveBar />
        </div>
      </StateCell>
      <StateCell name="Decorative hairline (a tile's watched share)">
        <div style={{ width: '12rem' }}>
          <ProgressBar decorative value={0.6} />
        </div>
      </StateCell>
      <StateCell name="Labelled, hidden label">
        <div style={{ width: '12rem' }}>
          <ProgressBar label="Watched" value={0.35} valueText="35%" />
        </div>
      </StateCell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const watched = within(canvasElement).getByRole('progressbar', { name: 'Watched' });
    await expect(watched).toHaveAttribute('aria-valuenow', '35');
    await expect(watched).toHaveAttribute('aria-valuetext', '35%');
  },
};
