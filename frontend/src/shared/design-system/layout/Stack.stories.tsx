import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';

import { Badge } from '../badge/Badge';
import { Button } from '../button/Button';
import { TextField } from '../field/TextField';
import { SurfaceStage } from '../storyHelpers';
import { color, fontFamily, radius, type Space, space } from '../tokens';
import { Stack } from './Stack';

const meta = {
  title: 'Design System/Layout/Stack',
  tags: ['autodocs'],
  component: Stack,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Children along one axis, spaced by a space token, with cross-axis alignment and main-axis distribution. Passive layout: never a tab stop, never seizes arrow keys (navigation comes from a FocusGroup sharing its axis). A row never wraps; that is Inline. On TV the build turns the gap into margins between the children, mirrored for right-to-left text.',
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
} satisfies Meta<typeof Stack>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A visible box standing in for content. */
function Block({ children, height = '2.5rem' }: { children: ReactNode; height?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: height,
        padding: `0 ${space.sm}`,
        borderRadius: radius.sm,
        background: color.surfaceRaised,
        color: color.text,
        fontFamily,
      }}
    >
      {children}
    </div>
  );
}

const gaps: Space[] = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl'];

export const Gaps: Story = {
  render: () => (
    <Stack gap="xl">
      {gaps.map(gap => (
        <Stack key={gap} direction="row" gap={gap} aria-label={`Gap ${gap}`}>
          <Block>{gap}</Block>
          <Block>B</Block>
          <Block>C</Block>
        </Stack>
      ))}
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByLabelText('Gap md');
    const [first, second] = Array.from(row.children);
    const space = second.getBoundingClientRect().left - first.getBoundingClientRect().right;
    await expect(space).toBe(16);
  },
};

export const Alignment: Story = {
  render: () => (
    <Stack gap="lg">
      <Stack direction="row" gap="sm" align="center">
        <Block height="4rem">align center</Block>
        <Block>B</Block>
      </Stack>
      <Stack direction="row" gap="sm" align="baseline">
        <span style={{ color: color.text, fontSize: '2rem', fontFamily }}>Baseline</span>
        <Badge>4K</Badge>
      </Stack>
      <Stack direction="row" justify="between" align="center">
        <Block>justify between</Block>
        <Block>end</Block>
      </Stack>
      <Stack direction="column" gap="xs" align="start">
        <Block>column, align start</Block>
        <Block>hugs its content</Block>
      </Stack>
    </Stack>
  ),
};

/** Stacks compose: a form is a column of fields, then a row of actions, primary first. */
export const Composition: Story = {
  render: () => (
    <Stack as="form" gap="lg" aria-label="Server" onSubmit={event => event.preventDefault()}>
      <Stack gap="md">
        <TextField label="Server name" defaultValue="Home server" />
        <TextField label="Address" defaultValue="192.168.1.20" />
      </Stack>
      <Stack direction="row" gap="sm">
        <Button type="submit">Save</Button>
        <Button>Cancel</Button>
      </Stack>
    </Stack>
  ),
};

/** Right-to-left: rows run from the right, and the gap stays between the children. */
export const RightToLeft: Story = {
  render: () => (
    <div dir="rtl">
      <Stack direction="row" gap="md">
        <Block>أ</Block>
        <Block>ب</Block>
        <Block>ج</Block>
      </Stack>
    </div>
  ),
};
