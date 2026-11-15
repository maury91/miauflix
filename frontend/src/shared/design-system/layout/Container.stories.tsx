import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';

import { Button } from '../button/Button';
import { TextField } from '../field/TextField';
import { color, fontFamily, scrim, space, typeScale } from '../tokens';
import { Container, SafeArea } from './Container';
import { Stack } from './Stack';

const meta = {
  title: 'Design System/Layout/Container',
  tags: ['autodocs'],
  component: Container,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "Container centres content at a named width (`form` 35rem, `reading` 50rem, or `full`) with the web's viewport gutters (`md` on compact windows, `lg` from medium up); on TV it adds none, because the screen's SafeArea already keeps content off the edges. SafeArea pads a screen-sized region: the TV safe area (4rem × 2.25rem, 5% of a 1080p screen) at TV density, the device's insets on the web. Backgrounds and artwork bleed past it to the edges. Switch the toolbar's density to TV to see it.",
      },
    },
  },
} satisfies Meta<typeof Container>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Tints the box a layout takes, so its width and gutters show. */
function Area({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: space.md,
        background: color.surfaceRaised,
        color: color.text,
        fontFamily,
        fontSize: typeScale.body.fontSize,
        lineHeight: typeScale.body.lineHeight,
      }}
    >
      {children}
    </div>
  );
}

/** Each width in turn on the canvas; the canvas bleeds to the edges, the content does not. */
export const Widths: Story = {
  render: () => (
    <div style={{ minHeight: '100vh', background: color.canvas, padding: `${space.lg} 0` }}>
      <Stack gap="lg">
        <Container width="form" data-testid="form">
          <Area>form: a single column of fields, 35rem</Area>
        </Container>
        <Container width="reading" data-testid="reading">
          <Area>reading: text and settings pages, 50rem</Area>
        </Container>
        <Container width="full">
          <Area>full: browse screens, the whole width inside the gutters</Area>
        </Container>
      </Stack>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const form = within(canvasElement).getByTestId('form');
    const area = form.firstElementChild as HTMLElement;
    // Never wider than the form width, whatever the gutters
    await expect(area.getBoundingClientRect().width).toBeLessThanOrEqual(560);
  },
};

function Screen() {
  return (
    // The artwork and scrim bleed to the edges; the content sits in the safe area
    <div
      style={{
        minHeight: '100vh',
        background: `${scrim.heroSide}, linear-gradient(115deg, #f4d58d 0%, #e07a5f 30%, #3d405b 65%, #0b132b 100%)`,
      }}
    >
      <SafeArea as="main" fill data-testid="safe-area">
        <Container width="form" gutters="none">
          <Stack gap="lg">
            <h1
              style={{
                margin: 0,
                color: color.text,
                fontFamily,
                fontSize: typeScale.title.fontSize,
              }}
            >
              Sign in
            </h1>
            <TextField label="Email" />
            <Button>Continue</Button>
          </Stack>
        </Container>
      </SafeArea>
    </div>
  );
}

/** At TV density the safe area keeps the form 4rem from the sides and 2.25rem from the top. */
export const TvSafeArea: Story = {
  globals: { density: 'tv' },
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const safeArea = within(canvasElement).getByTestId('safe-area');
    const style = getComputedStyle(safeArea);
    const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    await expect(parseFloat(style.paddingLeft)).toBe(4 * rootSize);
    await expect(parseFloat(style.paddingTop)).toBe(2.25 * rootSize);
  },
};

/** On the web the safe area is only the device's insets (none on a desktop). */
export const WebSafeArea: Story = {
  globals: { density: 'web' },
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const safeArea = within(canvasElement).getByTestId('safe-area');
    await expect(getComputedStyle(safeArea).paddingLeft).toBe('0px');
  },
};
