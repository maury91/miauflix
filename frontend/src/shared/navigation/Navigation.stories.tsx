import { Button } from '@shared/design-system/button/Button';
import { Dialog } from '@shared/design-system/dialog/Dialog';
import { PasswordField } from '@shared/design-system/field/PasswordField';
import { TextField } from '@shared/design-system/field/TextField';
import { Grid } from '@shared/design-system/layout/Grid';
import { SplitLayout } from '@shared/design-system/layout/SplitLayout';
import { isSplitStacked } from '@shared/design-system/layout/splitNavigation';
import { Stack } from '@shared/design-system/layout/Stack';
import { useWindowClass } from '@shared/design-system/layout/windowClass';
import { SurfaceStage } from '@shared/design-system/storyHelpers';
import { color, fontFamily, radius, space, typeScale } from '@shared/design-system/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';

import { useComposite, useFocusable } from './hooks';
import { NavigationInspector } from './NavigationInspector';
import { FocusGroup, FocusScope, NavigationProvider } from './NavigationProvider';

const meta = {
  title: 'Design System/Navigation',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      story: { inline: false, height: '30rem' },
      description: {
        component:
          'The navigation layer (style guide, section 10): one virtual focus owner over scopes, groups and focusable leaves. `NavigationProvider` receives keys through the shared `useKeyboard` dispatcher; `FocusScope` is a page or overlay boundary (`contain` for overlays: focus starts inside, never leaves, and returns to the opener); `FocusGroup` arranges children `horizontal`, `vertical`, `grid` (columns and spans) or `spatial` (rectangles), with entry memory and a `bubble`/`contain`/`wrap` edge; `useFocusable` and `useComposite` give components their `focused` state and pointer focus. Arrows move, Enter/Space activate (a field enters edit mode; Escape leaves it), Tab follows document order inside the topmost scope. The panel at the bottom right is the development inspector.',
      },
    },
  },
  decorators: [
    Story => (
      <NavigationProvider>
        <SurfaceStage surface="solid">
          <Story />
        </SurfaceStage>
        <NavigationInspector />
      </NavigationProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// Adapters: what library components will do internally with the navigation hooks

function NavButton({
  id,
  children,
  onClick,
}: {
  id: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const { ref, focused, onMouseMove } = useFocusable<HTMLButtonElement>(id);
  return (
    <Button ref={ref} focused={focused} onMouseMove={onMouseMove} onClick={onClick}>
      {children}
    </Button>
  );
}

function NavTextField({ id, label, type }: { id: string; label: string; type?: 'email' }) {
  const { ref, focused, onMouseMove } = useFocusable<HTMLInputElement>(id);
  return (
    <TextField ref={ref} label={label} type={type} focused={focused} onPointerFocus={onMouseMove} />
  );
}

function NavPasswordField({ id, label }: { id: string; label: string }) {
  const { ref, focusedPart, onPointerFocus } = useComposite<HTMLDivElement>(id, [
    'input',
    'reveal',
  ]);
  return (
    <div ref={ref}>
      <PasswordField
        label={label}
        showLabel="Show password"
        hideLabel="Hide password"
        focusedPart={focusedPart as 'input' | 'reveal' | undefined}
        onPointerFocus={onPointerFocus}
      />
    </div>
  );
}

const qrStyle: CSSProperties = {
  width: '8rem',
  height: '8rem',
  borderRadius: radius.md,
  background: `repeating-linear-gradient(45deg, ${color.text} 0 0.5rem, ${color.canvas} 0.5rem 1rem)`,
};

function Login() {
  const stacked = isSplitStacked(useWindowClass(), 'expanded');
  return (
    <FocusScope id="login" initialId="email">
      <div style={{ maxWidth: '56rem' }}>
        <FocusGroup id="split" layout={stacked ? 'vertical' : 'horizontal'}>
          <SplitLayout
            align="center"
            startLabel="Sign in with email"
            endLabel="Sign in with your phone"
            start={
              <FocusGroup id="form" layout="vertical">
                <Stack gap="md">
                  <NavTextField id="email" label="Email" type="email" />
                  <NavPasswordField id="password" label="Password" />
                  <NavButton id="signIn">Sign in</NavButton>
                </Stack>
              </FocusGroup>
            }
            end={
              <FocusGroup id="pairing" layout="vertical">
                <Stack gap="md" align="center">
                  <div style={qrStyle} role="img" aria-label="Pairing code" />
                  <NavButton id="newCode">New code</NavButton>
                  <NavButton id="copyLink">Copy link</NavButton>
                </Stack>
              </FocusGroup>
            }
          />
        </FocusGroup>
      </div>
    </FocusScope>
  );
}

const isFocused = (element: Element) => element.closest('[data-focused]') !== null;
const sideBySide = () => window.matchMedia('(min-width: 52.5em)').matches;

/**
 * Login's tree from the style guide: a horizontal split of two vertical groups. The password field
 * is a composite (input, then reveal); crossing back to a pane lands where it was left.
 */
export const LoginSplit: Story = {
  render: () => <Login />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const email = canvas.getByRole('textbox', { name: 'Email' });
    await waitFor(() => expect(isFocused(email)).toBe(true));
    if (!sideBySide()) return;

    await userEvent.keyboard('{ArrowDown}');
    const password = canvas.getByLabelText('Password', { selector: 'input' });
    await expect(isFocused(password)).toBe(true);
    // Into the composite's reveal part, then across to the pairing pane
    await userEvent.keyboard('{ArrowRight}');
    const reveal = canvas.getByRole('button', { name: 'Show password' });
    await expect(reveal).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('button', { name: 'New code' })).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowDown}');
    // Back to the form: its remembered leaf, the password field, entered at its near part
    await userEvent.keyboard('{ArrowLeft}');
    await expect(reveal).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('button', { name: 'Copy link' })).toHaveAttribute('data-focused');

    // Confirm on the reveal part activates it; Confirm on a field enters edit mode
    await userEvent.keyboard('{ArrowLeft}{Enter}');
    await expect(canvas.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();
    await userEvent.keyboard('{ArrowLeft}{Enter}');
    await expect(document.activeElement).toBe(password);
    await userEvent.keyboard('{Escape}');
    await expect(document.activeElement).not.toBe(password);
    await expect(isFocused(password)).toBe(true);
  },
};

const keyRows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const keyStyle: CSSProperties = { fontFamily, fontSize: typeScale.body.fontSize };

function KeyboardGrid() {
  const [text, setText] = useState('');
  const [first, second, third] = keyRows.map(row => [...row]);
  const key = (name: string) => (
    <NavKey key={name} id={`key-${name}`} onPress={() => setText(value => value + name)}>
      {name}
    </NavKey>
  );
  return (
    <FocusScope id="search">
      <p style={{ ...keyStyle, color: color.textSecondary, margin: `0 0 ${space.md}` }}>
        Query: <span data-testid="query">{text}</span>
      </p>
      <FocusGroup id="keys" layout="grid" columns={10}>
        <Grid columns={10} gap="xs">
          {first.map(key)}
          {second.map(key)}
          <NavKey id="delete" onPress={() => setText(value => value.slice(0, -1))}>
            delete
          </NavKey>
          {third.map(key)}
          <NavKey id="space" span={3} onPress={() => setText(value => `${value} `)}>
            space
          </NavKey>
        </Grid>
      </FocusGroup>
    </FocusScope>
  );
}

function NavKey({
  id,
  span = 1,
  children,
  onPress,
}: {
  id: string;
  span?: number;
  children: ReactNode;
  onPress: () => void;
}) {
  const { ref, focused, onMouseMove } = useFocusable<HTMLButtonElement>(id, { span });
  return (
    <div style={{ gridColumn: `span ${span} / span ${span}` }}>
      <Button ref={ref} focused={focused} onMouseMove={onMouseMove} onClick={onPress}>
        {children}
      </Button>
    </div>
  );
}

/**
 * A grid group with spans: ten columns, the space bar spanning three. Down from "l" reaches the
 * space bar; Up comes back to the column it left, not the bar's first column ("k").
 */
export const KeyboardGridGroup: Story = {
  render: () => <KeyboardGrid />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const key = (name: string) => canvas.getByRole('button', { name });
    await waitFor(() => expect(key('q')).toHaveAttribute('data-focused'));
    await userEvent.keyboard('{ArrowDown}');
    await expect(key('a')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowRight}'.repeat(8));
    await expect(key('l')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowDown}');
    await expect(key('space')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowUp}');
    await expect(key('l')).toHaveAttribute('data-focused');
    // Grids never wrap: Right from the row's last key stays
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await expect(key('delete')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowLeft}{Enter}');
    await expect(canvas.getByTestId('query')).toHaveTextContent('l');
  },
};

function WithDialog() {
  const [open, setOpen] = useState(false);
  const [removed, setRemoved] = useState(false);
  return (
    <FocusScope id="servers" layout="horizontal">
      <NavButton id="edit">Edit</NavButton>
      <span style={{ display: 'inline-block', width: space.sm }} />
      <NavButton id="remove" onClick={() => setOpen(true)}>
        {removed ? 'Removed' : 'Remove'}
      </NavButton>
      {open && (
        <FocusScope id="confirm" contain layout="horizontal">
          <Dialog
            open
            title="Remove this server?"
            description="Its library stays on the server."
            onDismiss={() => setOpen(false)}
            actions={
              <>
                <NavButton id="keep" onClick={() => setOpen(false)}>
                  Keep
                </NavButton>
                <NavButton
                  id="confirmRemove"
                  onClick={() => {
                    setRemoved(true);
                    setOpen(false);
                  }}
                >
                  Remove
                </NavButton>
              </>
            }
          />
        </FocusScope>
      )}
    </FocusScope>
  );
}

/**
 * An overlay scope: focus starts on the dialog's first action, arrows never reach the page behind,
 * and Back (the dialog's own dismissal) or an action returns focus to the opener.
 */
export const OverlayScope: Story = {
  render: () => <WithDialog />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const remove = canvas.getByRole('button', { name: 'Remove' });
    await userEvent.keyboard('{ArrowRight}');
    await expect(remove).toHaveAttribute('data-focused');
    await userEvent.keyboard('{Enter}');
    const dialog = await within(document.body).findByRole('dialog');
    const keep = within(dialog).getByRole('button', { name: 'Keep' });
    await waitFor(() => expect(keep).toHaveAttribute('data-focused'));
    // Contained: the edges stop, and the page behind is never reached
    await userEvent.keyboard('{ArrowLeft}{ArrowUp}{ArrowDown}');
    await expect(keep).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowRight}');
    await expect(within(dialog).getByRole('button', { name: 'Remove' })).toHaveAttribute(
      'data-focused'
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    await expect(remove).toHaveAttribute('data-focused');
  },
};

const tiles: { id: string; left: number; top: number; width: number; height: number }[] = [
  { id: 'Hero', left: 0, top: 0, width: 14, height: 8 },
  { id: 'Trailer', left: 15, top: 0, width: 8, height: 4 },
  { id: 'Cast', left: 15, top: 5, width: 8, height: 3 },
  { id: 'Episodes', left: 2, top: 9, width: 10, height: 3 },
  { id: 'Similar', left: 13, top: 10, width: 10, height: 3 },
];

function SpatialTile({ id, style }: { id: string; style: CSSProperties }) {
  const { ref, focused, onMouseMove } = useFocusable<HTMLButtonElement>(id);
  return (
    <button
      ref={ref}
      type="button"
      data-focused={focused || undefined}
      onMouseMove={onMouseMove}
      style={{
        position: 'absolute',
        boxSizing: 'border-box',
        border: 0,
        borderRadius: radius.md,
        background: focused ? color.actionFocus : color.surfaceRaised,
        color: focused ? color.onActionFocus : color.text,
        fontFamily,
        fontSize: typeScale.body.fontSize,
        ...style,
      }}
    >
      {id}
    </button>
  );
}

/**
 * A spatial group: an irregular arrangement moves by rectangles (the nearest band in the
 * direction, then overlap, then distance), measured only when a key moves inside it.
 */
export const SpatialGroup: Story = {
  render: () => (
    <FocusScope id="detail" layout="spatial">
      <div style={{ position: 'relative', height: '14rem', width: '24rem' }}>
        {tiles.map(({ id, left, top, width, height }) => (
          <SpatialTile
            key={id}
            id={id}
            style={{
              left: `${left}rem`,
              top: `${top}rem`,
              width: `${width}rem`,
              height: `${height}rem`,
            }}
          />
        ))}
      </div>
    </FocusScope>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tile = (name: string) => canvas.getByRole('button', { name });
    await waitFor(() => expect(tile('Hero')).toHaveAttribute('data-focused'));
    await userEvent.keyboard('{ArrowRight}');
    await expect(tile('Trailer')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowDown}');
    await expect(tile('Cast')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowDown}');
    await expect(tile('Similar')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowLeft}');
    await expect(tile('Episodes')).toHaveAttribute('data-focused');
    // The pointer focuses what it moves onto
    fireEvent.mouseMove(window, { clientX: 3, clientY: 3 });
    fireEvent.mouseMove(tile('Hero'), { clientX: 3, clientY: 3 });
    await expect(tile('Hero')).toHaveAttribute('data-focused');
  },
};
