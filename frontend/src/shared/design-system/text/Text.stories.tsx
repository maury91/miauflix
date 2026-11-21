import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Stack } from '../layout/Stack';
import { SurfaceStage } from '../storyHelpers';
import { typeScale } from '../tokens';
import { Heading, Text } from './Text';

const meta = {
  title: 'Design System/Foundations/Text',
  tags: ['autodocs'],
  component: Text,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Text and Heading set type only through the named roles (display, title, heading, body, label, caption), never a size of their own. Heading separates the outline (`level`) from the look (`variant`) and stays in sentence case. `tone` is primary, secondary (helper text) or disabled. `maxLines` truncates: one line with an ellipsis, or 2 to 6 clamped lines; the full text stays readable by assistive technology. Passive: never a focus target.',
      },
    },
  },
  args: { children: 'Text' },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof Text>;

const roles = Object.keys(typeScale) as (keyof typeof typeScale)[];

/** Every role of the type scale. */
export const Roles: Story = {
  render: () => (
    <Stack gap="sm">
      {roles.map(role => (
        <Text key={role} variant={role}>
          {`${role} · The quick brown fox jumps over the lazy dog`}
        </Text>
      ))}
    </Stack>
  ),
};

const synopsis =
  'A former soldier returns home to find the town he grew up in changed beyond recognition, and the people he left behind keeping secrets of their own.';

/** Headings keep their level and pick a look; tones and truncation. */
export const HeadingsTonesAndTruncation: Story = {
  // The disabled tone is for unavailable items, exempt from contrast (WCAG 1.4.3)
  parameters: { a11y: { context: { exclude: ['[data-tone="disabled"]'] } } },
  render: () => (
    <div style={{ maxWidth: '24rem' }}>
      <Stack gap="md">
        <Heading level={1}>Level 1, the title role</Heading>
        <Heading level={2}>Level 2, the heading role</Heading>
        <Heading level={2} variant="display">
          Level 2 that looks like a display
        </Heading>
        <Text tone="secondary">Secondary: helper text, essential or not.</Text>
        <Text tone="disabled">Disabled: an unavailable item.</Text>
        <Text maxLines={1}>{synopsis}</Text>
        <Text maxLines={2}>{synopsis}</Text>
      </Stack>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const display = canvas.getByRole('heading', { level: 2, name: /looks like a display/ });
    const plain = canvas.getByRole('heading', { level: 2, name: /heading role/ });
    // The look, not the level, decides the size; never uppercased by the app's global rule
    const size = (element: HTMLElement) => parseFloat(getComputedStyle(element).fontSize);
    await expect(size(display)).toBeGreaterThan(size(plain));
    await expect(getComputedStyle(display).textTransform).toBe('none');
    // Truncated text is still whole for assistive technology
    const [oneLine] = canvas.getAllByText(synopsis);
    await expect(oneLine.scrollWidth).toBeGreaterThan(oneLine.clientWidth);
  },
};
