import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Badge } from '../badge/Badge';
import { Button } from '../button/Button';
import { Chip } from '../chip/Chip';
import { SurfaceStage } from '../storyHelpers';
import { color, fontFamily, typeScale } from '../tokens';
import { Inline } from './Inline';

const meta = {
  title: 'Design System/Layout/Inline',
  tags: ['autodocs'],
  component: Inline,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A row that wraps onto more lines: chips, badges, metadata, a few short actions. Items keep their own size; the gap (and an optional row gap) is a space token. Passive layout: never a tab stop, never seizes arrow keys. On TV the build turns the gaps into margins: between items along a line (mirrored for right-to-left text), under every item, and taken back under the last line. Use Stack for a row that must stay on one line.',
      },
    },
  },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof Inline>;

export default meta;
type Story = StoryObj<typeof meta>;

const genres = ['Drama', 'Science fiction', 'Thriller', 'Comedy', 'Documentary', 'Animation'];
const caption = {
  color: color.textSecondary,
  fontFamily,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
};

/** Narrow on purpose: the chips wrap onto a second line, spaced by the row gap. */
export const Wrapping: Story = {
  render: () => (
    <div style={{ width: '20rem' }}>
      <Inline as="ul" gap="xs" rowGap="sm" aria-label="Genres">
        {genres.map(genre => (
          <li key={genre}>
            <Chip>{genre}</Chip>
          </li>
        ))}
      </Inline>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const items = within(canvasElement).getAllByRole('listitem');
    const tops = new Set(items.map(item => Math.round(item.getBoundingClientRect().top)));
    await expect(tops.size).toBeGreaterThan(1);
    const [first, second] = items;
    const between = second.getBoundingClientRect().left - first.getBoundingClientRect().right;
    await expect(between).toBe(8);
  },
};

/** A metadata line: text and badges centred on one line, wrapping when narrow. */
export const Metadata: Story = {
  render: () => (
    <Inline gap="sm">
      <span style={caption}>2024</span>
      <span style={caption}>2 h 46 min</span>
      <Badge>4K</Badge>
      <Badge>HDR</Badge>
      <Badge tone="info">New</Badge>
    </Inline>
  ),
};

export const Distribution: Story = {
  render: () => (
    <div style={{ maxWidth: '30rem' }}>
      <Inline gap="sm" justify="between">
        <Button>Back</Button>
        <Button>Continue</Button>
      </Inline>
      <div style={{ height: '1.5rem' }} />
      <Inline gap="sm" justify="end">
        <Button>Cancel</Button>
        <Button>Save</Button>
      </Inline>
    </div>
  ),
};

/** Right-to-left: lines start on the right and the gap stays between the items. */
export const RightToLeft: Story = {
  render: () => (
    <div dir="rtl" style={{ width: '20rem' }}>
      <Inline gap="xs" rowGap="sm">
        {genres.map(genre => (
          <Chip key={genre}>{genre}</Chip>
        ))}
      </Inline>
    </div>
  ),
};
