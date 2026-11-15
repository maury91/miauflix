import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../button/Button';
import { SurfaceStage } from '../storyHelpers';
import { color, fontFamily, radius, space } from '../tokens';
import { Grid, GridItem } from './Grid';
import { gridLayout, stepGrid } from './gridNavigation';
import { Stack } from './Stack';
import { resolveResponsive, useWindowClass } from './windowClass';

const meta = {
  title: 'Design System/Layout/Grid',
  tags: ['autodocs'],
  component: Grid,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Equal columns (1 to 12, one count or one per window class) with items spanning them, spaced by space tokens. For content laid out in flow: forms, settings, swatches, a keyboard. Passive layout: navigation comes from a FocusGroup using `gridLayout` and `stepGrid` with the same columns and spans, never from measuring. Left/Right stay in the row, Up/Down keep the aligned column, a short row clamps to its nearest item, and the edges exit. Media tile grids position their items from known geometry instead.',
      },
    },
  },
  args: { columns: 3 },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof Grid>;

export default meta;
type Story = StoryObj<typeof meta>;

function Cell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: space.sm,
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

const responsiveColumns = { compact: 1, medium: 2, expanded: 4 };

function ResponsiveGrid() {
  const windowClass = useWindowClass();
  return (
    <Stack gap="md">
      <p style={{ margin: 0, color: color.textSecondary, fontFamily }}>
        {`${windowClass}: ${resolveResponsive(responsiveColumns, windowClass)} columns`}
      </p>
      <Grid as="ul" columns={responsiveColumns} gap="md" aria-label="Settings sections">
        {['Playback', 'Subtitles', 'Profiles', 'Servers', 'Trakt', 'About'].map(name => (
          <GridItem as="li" key={name}>
            <Cell>{name}</Cell>
          </GridItem>
        ))}
      </Grid>
    </Stack>
  );
}

/** One column on phones, two from `medium`, four from `expanded` (TV is `large`). */
export const Responsive: Story = {
  render: () => <ResponsiveGrid />,
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole('list', { name: 'Settings sections' });
    await expect(within(list).getAllByRole('listitem')).toHaveLength(6);
  },
};

/** Items span columns, per window class too; a span that does not fit starts the next row. */
export const Spans: Story = {
  render: () => (
    <Grid columns={4} gap="sm" rowGap="lg">
      <GridItem span={4}>
        <Cell>span 4</Cell>
      </GridItem>
      <GridItem span={2}>
        <Cell>span 2</Cell>
      </GridItem>
      <Cell>1</Cell>
      <GridItem span={2}>
        <Cell>span 2 (wraps)</Cell>
      </GridItem>
      <GridItem span={{ compact: 4, medium: 1 }}>
        <Cell>4, then 1 from medium</Cell>
      </GridItem>
    </Grid>
  ),
};

const keys = [
  ...'abcdefgh'.split('').map(key => ({ id: key, label: key.toUpperCase(), span: 1 })),
  { id: 'space', label: 'Space', span: 3 },
  { id: 'delete', label: 'Delete', span: 1 },
  { id: 'search', label: 'Search', span: 2 },
];
const keyColumns = 4;

function Keyboard() {
  const cells = gridLayout(
    keys.map(key => key.span),
    keyColumns
  );
  const [focused, setFocused] = useState(0);
  // The column Up/Down stay aligned with, kept across rows (a spanning key would pull it)
  const [column, setColumn] = useState(0);
  const [text, setText] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ focused, column });
  latest.current = { focused, column };

  const press = (index: number) => {
    const key = keys[index];
    if (key.id === 'space') setText(value => `${value} `);
    else if (key.id === 'delete') setText(value => value.slice(0, -1));
    else if (key.id !== 'search') setText(value => value + key.id);
  };
  const pressRef = useRef(press);
  pressRef.current = press;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = getKeyboardAction(event);
      const { focused, column } = latest.current;
      if (action === 'confirm') {
        event.preventDefault();
        pressRef.current(focused);
        return;
      }
      if (action !== 'up' && action !== 'down' && action !== 'left' && action !== 'right') return;
      event.preventDefault();
      const rtl = rootRef.current ? getComputedStyle(rootRef.current).direction === 'rtl' : false;
      const vertical = action === 'up' || action === 'down';
      const next = stepGrid(cells, focused, action, { rtl, column: vertical ? column : undefined });
      // At an edge the group exits; here there is nowhere to go, so focus stays
      if (next === null) return;
      setFocused(next);
      if (!vertical) setColumn(cells[next].column);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cells]);

  return (
    <div ref={rootRef} style={{ maxWidth: '24rem' }}>
      <p data-testid="typed" style={{ minHeight: '1.5rem', color: color.text, fontFamily }}>
        {text}
      </p>
      <Grid columns={keyColumns} gap="xs" aria-label="Keyboard">
        {keys.map((key, index) => (
          <GridItem key={key.id} span={key.span}>
            <Button
              fullWidth
              focused={focused === index}
              onMouseMove={() => {
                setFocused(index);
                setColumn(cells[index].column);
              }}
              // Tab moved DOM focus here (desktop keyboards): Confirm presses this key
              onFocus={() => {
                setFocused(index);
                setColumn(cells[index].column);
              }}
              onClick={() => press(index)}
            >
              {key.label}
            </Button>
          </GridItem>
        ))}
      </Grid>
    </div>
  );
}

/**
 * A FocusGroup over a Grid, sketched with `stepGrid`: the space bar spans three columns, and
 * coming back up from it returns to the column you left, not the bar's start. The last row is
 * short: Down from D reaches Search, the nearest key.
 */
export const KeyboardNavigation: Story = {
  render: () => <Keyboard />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const key = (name: string) => canvas.getByRole('button', { name });
    await expect(key('A')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowDown}');
    await expect(key('G')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowDown}');
    await expect(key('Space')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{Enter}{ArrowUp}');
    // Back to the column it came from (C, G), not the space bar's start (E)
    await expect(key('G')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowRight}{ArrowDown}{ArrowDown}');
    await expect(key('Search')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowRight}');
    await expect(key('Search')).toHaveAttribute('data-focused');
    await expect(canvas.getByTestId('typed').textContent).toBe(' ');
  },
};
