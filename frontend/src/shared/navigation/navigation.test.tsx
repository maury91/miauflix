import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useComposite, useFocusable, useNavigation } from './hooks';
import { FocusGroup, FocusScope, NavigationProvider } from './NavigationProvider';
import { enter, resolveMove, spatialPick } from './resolve';
import type { NavigationNode, NavigationTree, Rect } from './types';

// ---------------------------------------------------------------------------------------------
// The pure resolver, over a fake tree

interface FakeNode extends Omit<NavigationNode, 'parent'> {
  children?: FakeNode[];
  rect?: Rect;
  ineligible?: boolean;
}

function fakeTree(
  root: FakeNode,
  {
    rtl = false,
    remembered = {} as Record<string, string>,
    gridColumn = {} as Record<string, number>,
  } = {}
): NavigationTree {
  const nodes = new Map<string, NavigationNode & { fake: FakeNode }>();
  const walk = (node: FakeNode, parent: string | null) => {
    nodes.set(node.id, { ...node, parent, fake: node });
    node.children?.forEach(child => walk(child, node.id));
  };
  walk(root, null);
  const eligible = (id: string): boolean => {
    const node = nodes.get(id)?.fake;
    if (!node || node.ineligible || node.disabled) return false;
    return node.kind === 'leaf' || (node.children ?? []).some(child => eligible(child.id));
  };
  return {
    node: id => nodes.get(id),
    children: id => nodes.get(id)?.fake.children?.map(child => child.id) ?? [],
    eligible,
    rect: id => nodes.get(id)?.fake.rect ?? null,
    rtl: () => rtl,
    remembered: id => remembered[id],
    gridColumn: id => gridColumn[id],
  };
}

const leaf = (id: string, extra: Partial<FakeNode> = {}): FakeNode => ({
  id,
  kind: 'leaf',
  ...extra,
});
const group = (
  id: string,
  layout: NavigationNode['layout'],
  children: FakeNode[],
  extra: Partial<FakeNode> = {}
): FakeNode => ({ id, kind: 'group', layout, children, ...extra });
const box = (left: number, top: number, width = 10, height = 10): Rect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

/** A page: a header row over a two-pane split, each pane a column. */
const page = (extra: { form?: Partial<FakeNode>; split?: Partial<FakeNode> } = {}) =>
  ({
    id: 'page',
    kind: 'scope',
    layout: 'vertical',
    children: [
      group('header', 'horizontal', [leaf('back'), leaf('search')]),
      group(
        'split',
        'horizontal',
        [
          group('form', 'vertical', [leaf('email'), leaf('password'), leaf('submit')], extra.form),
          group('pairing', 'vertical', [leaf('newCode'), leaf('copy')]),
        ],
        extra.split
      ),
    ],
  }) satisfies FakeNode;

const move = (tree: NavigationTree, from: string, direction: 'up' | 'down' | 'left' | 'right') =>
  resolveMove(tree, from, direction, { scopeId: 'page' });

describe('resolveMove', () => {
  it('steps along a group axis and bubbles perpendicular moves to the parent', () => {
    const tree = fakeTree(page());
    expect(move(tree, 'back', 'right')).toMatchObject({ type: 'move', targetId: 'search' });
    expect(move(tree, 'email', 'down')).toMatchObject({ type: 'move', targetId: 'password' });
    // Right from the form column: the split steps to the pairing pane, entered at its first item
    expect(move(tree, 'password', 'right')).toMatchObject({ type: 'move', targetId: 'newCode' });
    // Up from the first form item leaves the split for the header
    expect(move(tree, 'email', 'up')).toMatchObject({ type: 'move', targetId: 'back' });
  });

  it('is unhandled at the edge of the scope and never blurs', () => {
    const tree = fakeTree(page());
    expect(move(tree, 'back', 'left')).toMatchObject({ type: 'unhandled' });
    expect(move(tree, 'submit', 'down')).toMatchObject({ type: 'unhandled' });
  });

  it('applies contain and wrap at a group edge', () => {
    const contained = fakeTree(page({ form: { edge: 'contain' } }));
    expect(move(contained, 'submit', 'down')).toMatchObject({ type: 'blocked' });
    expect(move(contained, 'email', 'right')).toMatchObject({ type: 'blocked' });
    const wrapping = fakeTree(page({ form: { edge: 'wrap' } }));
    expect(move(wrapping, 'submit', 'down')).toMatchObject({ type: 'move', targetId: 'email' });
    // Wrapping is along the axis only: Right still bubbles to the split
    expect(move(wrapping, 'email', 'right')).toMatchObject({ type: 'move', targetId: 'newCode' });
  });

  it('mirrors inline moves for right-to-left text', () => {
    const tree = fakeTree(page(), { rtl: true });
    expect(move(tree, 'search', 'right')).toMatchObject({ type: 'move', targetId: 'back' });
    expect(move(tree, 'email', 'left')).toMatchObject({ type: 'move', targetId: 'newCode' });
  });

  it('skips ineligible siblings and groups with nothing eligible', () => {
    const tree = fakeTree({
      id: 'page',
      kind: 'scope',
      layout: 'horizontal',
      children: [
        leaf('a'),
        leaf('b', { disabled: true }),
        group('empty', 'vertical', [leaf('x', { ineligible: true })]),
        leaf('c'),
      ],
    });
    expect(move(tree, 'a', 'right')).toMatchObject({ type: 'move', targetId: 'c' });
  });

  it('follows a valid override and ignores one outside the scope', () => {
    const tree = fakeTree(page({ form: { overrides: { up: 'search' } } }));
    expect(move(tree, 'email', 'up')).toMatchObject({
      type: 'move',
      targetId: 'search',
      reason: 'override',
    });
    const outside = resolveMove(tree, 'email', 'up', { scopeId: 'split' });
    expect(outside).toMatchObject({ type: 'unhandled' });
  });

  it('enters a group at its remembered leaf, then selected, default, near end, aligned, first', () => {
    const remembered = fakeTree(page(), { remembered: { pairing: 'copy' } });
    expect(move(remembered, 'password', 'right')).toMatchObject({ targetId: 'copy' });

    const selected = fakeTree({
      id: 'page',
      kind: 'scope',
      layout: 'vertical',
      children: [
        leaf('top'),
        group('tabs', 'horizontal', [leaf('one'), leaf('two', { selected: true }), leaf('three')]),
      ],
    });
    expect(move(selected, 'top', 'down')).toMatchObject({ targetId: 'two' });

    const withDefault = fakeTree(page({ form: { defaultId: 'submit' } }));
    expect(move(withDefault, 'newCode', 'left')).toMatchObject({ targetId: 'submit' });

    // Along the axis: entered at the near end (Left into a row lands on its last item)
    const row = fakeTree({
      id: 'page',
      kind: 'scope',
      layout: 'horizontal',
      children: [group('row', 'horizontal', [leaf('r1'), leaf('r2')]), leaf('after')],
    });
    expect(move(row, 'after', 'left')).toMatchObject({ targetId: 'r2' });

    // Across the axis: the child nearest to where focus came from
    const aligned = fakeTree({
      id: 'page',
      kind: 'scope',
      layout: 'vertical',
      children: [
        leaf('above', { rect: box(100, 0) }),
        group('row', 'horizontal', [
          leaf('c1', { rect: box(0, 50) }),
          leaf('c2', { rect: box(95, 50) }),
          leaf('c3', { rect: box(200, 50) }),
        ]),
      ],
    });
    expect(move(aligned, 'above', 'down')).toMatchObject({ targetId: 'c2' });
    expect(enter(aligned, 'row', null, null)).toEqual({ id: 'c1', part: undefined });
  });

  it('moves through a grid by rows, columns and spans, keeping the aligned column', () => {
    // A keyboard: q w e / a s d / [space spans 3]
    const tree = fakeTree(
      {
        id: 'page',
        kind: 'scope',
        layout: 'vertical',
        children: [
          group(
            'keys',
            'grid',
            ['q', 'w', 'e', 'a', 's', 'd'].map(key => leaf(key)).concat(leaf('space', { span: 3 })),
            { columns: 3 }
          ),
        ],
      },
      { gridColumn: { keys: 2 } }
    );
    expect(move(tree, 'q', 'right')).toMatchObject({ targetId: 'w', gridColumn: { column: 1 } });
    expect(move(tree, 'd', 'down')).toMatchObject({ targetId: 'space' });
    // From the space bar, up returns to the kept column (2), not the bar's start
    expect(move(tree, 'space', 'up')).toMatchObject({
      targetId: 'd',
      gridColumn: { groupId: 'keys', column: 2 },
    });
    expect(move(tree, 'e', 'right')).toMatchObject({ type: 'unhandled' });
  });

  it('moves a spatial group by the nearest band, overlap and distance', () => {
    const tree = fakeTree({
      id: 'page',
      kind: 'scope',
      layout: 'spatial',
      children: [
        leaf('origin', { rect: box(0, 0, 100, 40) }),
        leaf('farOverlap', { rect: box(20, 300, 60, 40) }),
        leaf('nearOffset', { rect: box(150, 60, 60, 40) }),
        leaf('nearOverlap', { rect: box(60, 64, 60, 40) }),
        leaf('right', { rect: box(120, 0, 40, 40) }),
      ],
    });
    expect(move(tree, 'origin', 'down')).toMatchObject({ targetId: 'nearOverlap' });
    expect(move(tree, 'origin', 'right')).toMatchObject({ targetId: 'right' });
    expect(move(tree, 'origin', 'up')).toMatchObject({ type: 'unhandled' });
    expect(spatialPick(box(0, 0), [], 'down')).toBeNull();
  });

  it('moves between composite parts before leaving, entering at the near part', () => {
    const tree = fakeTree({
      id: 'page',
      kind: 'scope',
      layout: 'horizontal',
      children: [leaf('before'), leaf('field', { parts: ['input', 'reveal'] }), leaf('after')],
    });
    expect(resolveMove(tree, 'field', 'right', { scopeId: 'page', part: 'input' })).toEqual({
      type: 'handled',
      part: 'reveal',
      reason: 'part reveal',
    });
    expect(resolveMove(tree, 'field', 'right', { scopeId: 'page', part: 'reveal' })).toMatchObject({
      targetId: 'after',
    });
    expect(move(tree, 'after', 'left')).toMatchObject({ targetId: 'field', part: 'reveal' });
    expect(move(tree, 'before', 'right')).toMatchObject({ targetId: 'field', part: 'input' });
  });
});

// ---------------------------------------------------------------------------------------------
// The React layer, in jsdom (which lays nothing out: elements get one client rect)

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

function Item({ id, onClick, disabled }: { id: string; onClick?: () => void; disabled?: boolean }) {
  const { ref, focused, onMouseMove } = useFocusable<HTMLButtonElement>(id, { disabled });
  return (
    <button
      ref={ref}
      type="button"
      data-focused={focused || undefined}
      onMouseMove={onMouseMove}
      onClick={onClick}
      disabled={disabled}
    >
      {id}
    </button>
  );
}

const focusedText = () => document.querySelector('[data-focused]')?.textContent ?? null;
const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });

function Page({ children }: { children?: ReactNode }) {
  return (
    <NavigationProvider>
      <FocusScope id="page">
        <FocusGroup id="row" layout="horizontal">
          <Item id="one" />
          <Item id="two" />
          <Item id="three" />
        </FocusGroup>
        {children}
      </FocusScope>
    </NavigationProvider>
  );
}

describe('NavigationProvider', () => {
  it('focuses the root scope on mount, moves with keys and mirrors DOM focus', () => {
    render(<Page />);
    expect(focusedText()).toBe('one');
    press('ArrowRight');
    expect(focusedText()).toBe('two');
    expect(document.activeElement).toBe(screen.getByText('two'));
    press('ArrowLeft');
    press('ArrowLeft');
    // The edge of the page: focus stays
    expect(focusedText()).toBe('one');
  });

  it('activates the focused element once on Confirm; a held Confirm never repeats', () => {
    const onClick = vi.fn();
    render(
      <NavigationProvider>
        <FocusScope>
          <Item id="play" onClick={onClick} />
        </FocusScope>
      </NavigationProvider>
    );
    press('Enter');
    expect(onClick).toHaveBeenCalledTimes(1);
    press('Enter', { repeat: true });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('swallows held arrows faster than the browsing interval', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    render(<Page />);
    press('ArrowRight');
    now.mockReturnValue(1040);
    press('ArrowRight', { repeat: true });
    expect(focusedText()).toBe('two');
    now.mockReturnValue(1100);
    press('ArrowRight', { repeat: true });
    expect(focusedText()).toBe('three');
  });

  it('focuses on pointer movement, except while locked or where the pointer rested', () => {
    let lock: (() => () => void) | undefined;
    function LockGrabber() {
      lock = useNavigation().lockPointer;
      return null;
    }
    render(
      <Page>
        <LockGrabber />
      </Page>
    );
    fireEvent.mouseMove(screen.getByText('three'), { clientX: 30, clientY: 5 });
    expect(focusedText()).toBe('three');
    press('ArrowLeft');
    expect(focusedText()).toBe('two');
    // Content moved under the resting pointer: the same coordinates focus nothing
    fireEvent.mouseMove(screen.getByText('one'), { clientX: 30, clientY: 5 });
    expect(focusedText()).toBe('two');

    const release = lock!();
    fireEvent.mouseMove(screen.getByText('one'), { clientX: 10, clientY: 5 });
    expect(focusedText()).toBe('two');
    release();
    fireEvent.mouseMove(screen.getByText('one'), { clientX: 11, clientY: 5 });
    expect(focusedText()).toBe('one');
  });

  it('moves to the nearest sibling when the focused item is removed', async () => {
    function Removable() {
      const [shown, setShown] = useState(true);
      return (
        <NavigationProvider>
          <FocusScope>
            <FocusGroup layout="horizontal">
              <Item id="a" />
              {shown && <Item id="b" onClick={() => setShown(false)} />}
              <Item id="c" />
            </FocusGroup>
          </FocusScope>
        </NavigationProvider>
      );
    }
    render(<Removable />);
    press('ArrowRight');
    expect(focusedText()).toBe('b');
    await act(async () => {
      press('Enter');
      await Promise.resolve();
    });
    expect(focusedText()).toBe('c');
  });

  it('contains focus in an overlay scope and restores the opener when it closes', () => {
    function WithOverlay() {
      const [open, setOpen] = useState(false);
      return (
        <Page>
          <FocusGroup layout="horizontal">
            <Item id="open" onClick={() => setOpen(true)} />
          </FocusGroup>
          {open && (
            <FocusScope contain layout="horizontal">
              <Item id="ok" onClick={() => setOpen(false)} />
              <Item id="cancel" />
            </FocusScope>
          )}
        </Page>
      );
    }
    render(<WithOverlay />);
    press('ArrowDown');
    expect(focusedText()).toBe('open');
    act(() => {
      press('Enter');
    });
    expect(focusedText()).toBe('ok');
    press('ArrowUp');
    expect(focusedText()).toBe('ok');
    // The pointer cannot reach behind the overlay either
    fireEvent.mouseMove(screen.getByText('one'), { clientX: 1, clientY: 1 });
    expect(focusedText()).toBe('ok');
    press('Tab');
    expect(focusedText()).toBe('cancel');
    press('Tab');
    expect(focusedText()).toBe('ok');
    act(() => {
      press('Enter');
    });
    expect(focusedText()).toBe('open');
  });

  it('derives the grid column from the cell Tab lands on', () => {
    render(
      <NavigationProvider>
        <FocusScope>
          <FocusGroup layout="grid" columns={2}>
            {['a', 'b', 'c', 'd', 'e', 'f'].map(id => (
              <Item key={id} id={id} />
            ))}
          </FocusGroup>
        </FocusScope>
      </NavigationProvider>
    );
    press('ArrowRight');
    expect(focusedText()).toBe('b');
    press('Tab');
    expect(focusedText()).toBe('c');
    // Not the column kept from b
    press('ArrowDown');
    expect(focusedText()).toBe('e');
  });

  it('enters edit mode on Confirm and leaves it on Back before anything else', () => {
    function Field() {
      const { ref, focused, onMouseMove } = useFocusable<HTMLInputElement>('email');
      return (
        <input
          ref={ref}
          aria-label="Email"
          data-focused={focused || undefined}
          onMouseMove={onMouseMove}
        />
      );
    }
    const onBack = vi.fn((event: KeyboardEvent) => event.key);
    render(
      <NavigationProvider>
        <FocusScope>
          <Field />
          <Item id="next" />
        </FocusScope>
      </NavigationProvider>
    );
    document.addEventListener('keydown', onBack);
    const input = screen.getByRole('textbox', { name: 'Email' });
    press('Enter');
    expect(document.activeElement).toBe(input);
    // While editing, arrows belong to the caret
    press('ArrowDown');
    expect(focusedText()).toBe('');
    expect(input).toHaveAttribute('data-focused');
    press('Escape');
    expect(document.activeElement).not.toBe(input);
    expect(onBack.mock.results.map(result => result.value)).not.toContain('Escape');
    press('ArrowDown');
    expect(focusedText()).toBe('next');
    document.removeEventListener('keydown', onBack);
  });

  it('moves between composite parts, then out', () => {
    function PasswordLike() {
      const { ref, focusedPart, onPointerFocus } = useComposite<HTMLDivElement>('password', [
        'input',
        'reveal',
      ]);
      return (
        <div ref={ref}>
          <span
            data-focused={focusedPart === 'input' || undefined}
            onMouseMove={() => onPointerFocus('input')}
          >
            input
          </span>
          <button type="button" data-focused={focusedPart === 'reveal' || undefined}>
            reveal
          </button>
        </div>
      );
    }
    render(
      <NavigationProvider>
        <FocusScope layout="horizontal">
          <PasswordLike />
          <Item id="after" />
        </FocusScope>
      </NavigationProvider>
    );
    expect(focusedText()).toBe('input');
    press('ArrowRight');
    expect(focusedText()).toBe('reveal');
    press('ArrowRight');
    expect(focusedText()).toBe('after');
    press('ArrowLeft');
    expect(focusedText()).toBe('reveal');
  });

  it('skips a disabled item', () => {
    render(
      <NavigationProvider>
        <FocusScope layout="horizontal">
          <Item id="a" />
          <Item id="b" disabled />
          <Item id="c" />
        </FocusScope>
      </NavigationProvider>
    );
    press('ArrowRight');
    expect(focusedText()).toBe('c');
  });
});
