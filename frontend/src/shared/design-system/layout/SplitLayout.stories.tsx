import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../button/Button';
import { PasswordField } from '../field/PasswordField';
import { TextField } from '../field/TextField';
import { SurfaceStage } from '../storyHelpers';
import { color, fontFamily, radius, space, typeScale } from '../tokens';
import { SplitLayout } from './SplitLayout';
import {
  isSplitStacked,
  paneEntry,
  paneOf,
  rememberPaneFocus,
  type SplitPane,
  type SplitPaneMemory,
  stepSplit,
} from './splitNavigation';
import { Stack } from './Stack';
import { useWindowClass } from './windowClass';

const meta = {
  title: 'Design System/Layout/SplitLayout',
  tags: ['autodocs'],
  component: SplitLayout,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Two panes, side by side from a window class up and stacked below it (start on top): rail and content (`rail`, a fixed 20rem), preview and settings (`narrow`, 37.5%), form and pairing panel (`even`). TV is the `large` class, so a TV screen is always side by side. Passive layout: never a tab stop and it never seizes arrow keys. The navigation layer crosses between the panes with `stepSplit` (Left/Right side by side, mirrored for right-to-left text; Up/Down stacked) and enters a pane at its last focused item with `paneEntry`, so going back lands where the user left. Gaps are margins, so the TV build needs no flex `gap`. `fill` fills the parent so each pane can hold its own ScrollArea.',
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
  args: { start: null, end: null },
} satisfies Meta<typeof SplitLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

const placeholderStyle: CSSProperties = {
  boxSizing: 'border-box',
  minHeight: '8rem',
  padding: space.md,
  borderRadius: radius.md,
  background: color.surfaceRaised,
  color: color.textSecondary,
  fontFamily,
  fontSize: typeScale.caption.fontSize,
};

function Placeholder({ children }: { children: ReactNode }) {
  return <div style={placeholderStyle}>{children}</div>;
}

const caption: CSSProperties = {
  margin: `0 0 ${space.xs}`,
  color: color.textSecondary,
  fontFamily,
  fontSize: typeScale.caption.fontSize,
};

/** The three splits, side by side from the medium window class. */
export const Splits: Story = {
  render: () => (
    <Stack gap="xl">
      {(
        [
          ['rail', 'Rail (20rem)', 'Content'],
          ['narrow', 'Preview (37.5%)', 'Settings'],
          ['even', 'Form', 'Pairing panel'],
        ] as const
      ).map(([split, startText, endText]) => (
        <div key={split}>
          <p style={caption}>{split}</p>
          <SplitLayout
            split={split}
            stackBelow="medium"
            gap="lg"
            start={<Placeholder>{startText}</Placeholder>}
            end={<Placeholder>{endText}</Placeholder>}
          />
        </div>
      ))}
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const panes = canvasElement.querySelectorAll('[data-pane]');
    if (!window.matchMedia('(min-width: 37.5em)').matches) return;
    const [railStart, railEnd, narrowStart, , evenStart, evenEnd] = [...panes].map(pane =>
      pane.getBoundingClientRect()
    );
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    await expect(railStart.width).toBeCloseTo(20 * rem, 0);
    // Side by side, with the gap between
    await expect(railEnd.top).toBeCloseTo(railStart.top, 0);
    await expect(railEnd.left - railStart.right).toBeCloseTo(1.5 * rem, 0);
    const parent = (panes[2].parentElement as HTMLElement).getBoundingClientRect();
    await expect(narrowStart.width / parent.width).toBeCloseTo(0.375, 2);
    await expect(evenStart.width).toBeCloseTo(evenEnd.width, 0);
  },
};

const panes: Record<SplitPane, readonly string[]> = {
  start: ['email', 'password', 'signIn'],
  end: ['newCode', 'copyLink'],
};

/**
 * Story-only stand-in for the navigation layer over a split: Up/Down move inside a pane, the split
 * axis crosses between panes (`stepSplit`), and entering a pane lands on its last focused item
 * (`paneEntry`). The real layer (style guide, section 10) adds scopes and the pointer lock.
 */
function useSplitStoryFocus(initialId: string) {
  const [focusedId, setFocusedId] = useState(initialId);
  const state = useRef({ focusedId: initialId, memory: {} as SplitPaneMemory });
  const containerRef = useRef<HTMLDivElement>(null);
  const windowClass = useWindowClass();
  const stacked = isSplitStacked(windowClass, 'expanded');

  const paneOfId = (id: string): SplitPane => (panes.start.includes(id) ? 'start' : 'end');
  const focus = (id: string) => {
    const pane = paneOfId(id);
    state.current = {
      focusedId: id,
      memory: rememberPaneFocus(state.current.memory, pane, id),
    };
    setFocusedId(id);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = getKeyboardAction(event);
      if (
        direction !== 'up' &&
        direction !== 'down' &&
        direction !== 'left' &&
        direction !== 'right'
      ) {
        return;
      }
      event.preventDefault();
      const { focusedId: current, memory } = state.current;
      const container = containerRef.current;
      const focusedElement = container?.querySelector('[data-focused]') ?? null;
      const pane = paneOf(focusedElement) ?? paneOfId(current);
      const rtl = container ? getComputedStyle(container).direction === 'rtl' : false;
      const crossTo = stepSplit(pane, direction, { stacked, rtl });
      const items = panes[pane];
      const index = items.indexOf(current);
      // Inside a pane first, along its own (vertical) axis
      if (direction === 'up' || direction === 'down') {
        const next = items[index + (direction === 'up' ? -1 : 1)];
        if (next !== undefined) {
          focus(next);
          return;
        }
      }
      if (crossTo) {
        const entry = paneEntry(memory, crossTo, panes[crossTo]);
        if (entry !== undefined) focus(entry);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return { containerRef, focusedId, focus, isFocused: (id: string) => focusedId === id };
}

const qrStyle: CSSProperties = {
  width: '8rem',
  height: '8rem',
  borderRadius: radius.md,
  background: `repeating-linear-gradient(45deg, ${color.text} 0 0.5rem, ${color.canvas} 0.5rem 1rem)`,
};

function Login({ dir }: { dir?: 'rtl' }) {
  const { containerRef, focusedId, focus, isFocused } = useSplitStoryFocus('email');
  return (
    <div ref={containerRef} dir={dir} data-story-focus={focusedId} style={{ maxWidth: '56rem' }}>
      <SplitLayout
        startLabel="Sign in with email"
        endLabel="Sign in with your phone"
        align="center"
        start={
          <Stack gap="md">
            <TextField
              label="Email"
              type="email"
              focused={isFocused('email')}
              onPointerFocus={() => focus('email')}
            />
            <PasswordField
              label="Password"
              showLabel="Show password"
              hideLabel="Hide password"
              focusedPart={isFocused('password') ? 'input' : undefined}
              onPointerFocus={() => focus('password')}
            />
            <Button focused={isFocused('signIn')} onMouseMove={() => focus('signIn')}>
              Sign in
            </Button>
          </Stack>
        }
        end={
          <Stack gap="md" align="center">
            <div style={qrStyle} role="img" aria-label="Pairing code" />
            <Button focused={isFocused('newCode')} onMouseMove={() => focus('newCode')}>
              New code
            </Button>
            <Button focused={isFocused('copyLink')} onMouseMove={() => focus('copyLink')}>
              Copy link
            </Button>
          </Stack>
        }
      />
    </div>
  );
}

/** The story's focused item ID. */
const focusedName = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('[data-story-focus]')?.getAttribute('data-story-focus') ?? '';

/**
 * Login's split: Up/Down move inside a pane, Left/Right cross, and coming back to a pane lands on
 * the item focused there last (the password field, then the second button).
 */
export const RememberedPaneEntry: Story = {
  render: () => <Login />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Sign in with email' })).toBeInTheDocument();
    const stacked = !window.matchMedia('(min-width: 52.5em)').matches;
    // Stacked, the end pane is below the last start item; side by side, to the right
    const cross = stacked ? '{ArrowDown}' : '{ArrowRight}';
    const back = stacked ? '{ArrowUp}' : '{ArrowLeft}';

    await userEvent.keyboard('{ArrowDown}');
    await expect(focusedName(canvasElement)).toBe('password');
    if (stacked) await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard(cross);
    await expect(focusedName(canvasElement)).toBe('newCode');
    await userEvent.keyboard('{ArrowDown}');
    await expect(focusedName(canvasElement)).toBe('copyLink');
    if (stacked) return;
    await userEvent.keyboard(back);
    await expect(focusedName(canvasElement)).toBe('password');
    await userEvent.keyboard(cross);
    await expect(focusedName(canvasElement)).toBe('copyLink');
  },
};

/** Right-to-left: the start pane is on the right, and Left crosses to the end pane. */
export const RightToLeft: Story = {
  render: () => <Login dir="rtl" />,
  play: async ({ canvasElement }) => {
    if (!window.matchMedia('(min-width: 52.5em)').matches) return;
    const [start, end] = [...canvasElement.querySelectorAll('[data-pane]')].map(pane =>
      pane.getBoundingClientRect()
    );
    await expect(end.right).toBeLessThan(start.left);
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    await expect(start.left - end.right).toBeCloseTo(2 * rem, 0);
    await userEvent.keyboard('{ArrowLeft}');
    await expect(focusedName(canvasElement)).toBe('newCode');
  },
};

/**
 * `fill` inside a fixed height: side by side each pane clips (here the end pane's list scrolls
 * itself); stacked, the whole split scrolls as one column.
 */
export const Fill: Story = {
  render: () => (
    <div style={{ height: '16rem' }}>
      <SplitLayout
        fill
        split="narrow"
        stackBelow="medium"
        start={<Placeholder>Preview</Placeholder>}
        end={
          // Focusable, so a keyboard can scroll it (a real list's rows would be)
          <div tabIndex={0} aria-label="Settings" style={{ height: '100%', overflowY: 'auto' }}>
            <Stack gap="xs">
              {Array.from({ length: 12 }, (_, index) => (
                <Placeholder key={index}>Setting {index + 1}</Placeholder>
              ))}
            </Stack>
          </div>
        }
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    if (!window.matchMedia('(min-width: 37.5em)').matches) return;
    const [start, end] = [...canvasElement.querySelectorAll('[data-pane]')];
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    await expect(end.getBoundingClientRect().height).toBeCloseTo(16 * rem, 0);
    await expect(start.getBoundingClientRect().height).toBeCloseTo(16 * rem, 0);
  },
};
