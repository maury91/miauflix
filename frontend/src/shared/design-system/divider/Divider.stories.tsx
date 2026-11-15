import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Badge } from '../badge/Badge';
import { Inline } from '../layout/Inline';
import { Stack } from '../layout/Stack';
import { SurfaceStage } from '../storyHelpers';
import { color, fontFamily, typeScale } from '../tokens';
import { Divider } from './Divider';

const meta = {
  title: 'Design System/Layout/Divider',
  tags: ['autodocs'],
  component: Divider,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A hairline separating groups of content, horizontal (`hr`) or vertical (a separator filling its row), with optional space-token spacing. `decorative` hides it from assistive technology. Translucent white over media. Never a focus target or part of navigation.',
      },
    },
  },
} satisfies Meta<typeof Divider>;

export default meta;
type Story = StoryObj<typeof meta>;

const text = {
  margin: 0,
  color: color.text,
  fontFamily,
  fontSize: typeScale.body.fontSize,
  lineHeight: typeScale.body.lineHeight,
};
const caption = { ...text, color: color.textSecondary, fontSize: typeScale.caption.fontSize };

function Example() {
  return (
    <div style={{ maxWidth: '28rem' }}>
      <p style={text}>Playback</p>
      <Divider spacing="md" />
      <p style={text}>Subtitles</p>
      <Divider spacing="md" />
      <Inline gap="sm">
        <span style={caption}>2024</span>
        <Divider orientation="vertical" decorative />
        <span style={caption}>2 h 46 min</span>
        <Divider orientation="vertical" decorative />
        <Badge>4K</Badge>
      </Inline>
    </div>
  );
}

export const OnCanvas: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <Example />
    </SurfaceStage>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('separator')).toHaveLength(2);
  },
};

export const OverMedia: Story = {
  render: () => (
    <SurfaceStage surface="overMedia">
      <Stack gap="md">
        <Example />
      </Stack>
    </SurfaceStage>
  ),
};
