import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { StateCell, SurfaceStage } from '../storyHelpers';
import { Badge } from './Badge';

import SparklesIcon from '~icons/ion/sparkles';

const meta = {
  title: 'Design System/Collections/Badge',
  tags: ['autodocs'],
  component: Badge,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A passive, compact label: never a focus target, never an action, never brand red. Labels are uppercase caption text (the only uppercase in the library) on an opaque dark fill, so they read the same on the canvas and over artwork; a feedback tone colours only the border and text. Counts are pills, light on dark surfaces and dark on a focused action. `accessibleLabel` replaces abbreviations and counts for assistive technology.',
      },
    },
  },
  args: { children: '4K' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof Badge>;

const row = { display: 'flex', alignItems: 'center' } as const;
const gap = { marginRight: '0.5rem' };

function Matrix() {
  return (
    <>
      <StateCell name="Tones">
        <div style={row}>
          <span style={gap}>
            <Badge>1080p</Badge>
          </span>
          <span style={gap}>
            <Badge tone="info">New</Badge>
          </span>
          <span style={gap}>
            <Badge tone="success" icon={<SparklesIcon />}>
              Clean
            </Badge>
          </span>
          <span style={gap}>
            <Badge tone="warning">Cam</Badge>
          </span>
          <Badge tone="danger">Unavailable</Badge>
        </div>
      </StateCell>
      <StateCell name="Counts">
        <div style={row}>
          <span style={gap}>
            <Badge kind="count" accessibleLabel="3 unread">
              3
            </Badge>
          </span>
          <Badge kind="count" accessibleLabel="120 unread">
            99+
          </Badge>
        </div>
      </StateCell>
    </>
  );
}

export const OnCanvas: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <Matrix />
    </SurfaceStage>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The count's visible text is replaced for assistive technology
    await expect(canvas.getByText('120 unread')).toBeInTheDocument();
    await expect(canvas.getByText('99+')).toHaveAttribute('aria-hidden', 'true');
  },
};

/** The opaque fill keeps every badge readable over bright artwork. */
export const OverArtwork: Story = {
  render: () => (
    <SurfaceStage surface="overMedia">
      <Matrix />
    </SurfaceStage>
  ),
};
