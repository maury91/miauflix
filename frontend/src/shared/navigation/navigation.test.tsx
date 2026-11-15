import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useComposite, useFocusable, useNavigation, useNavigationStore } from './hooks';
import { FocusGroup, FocusScope, NavigationProvider } from './NavigationProvider';
import { enter, resolveMove, spatialPick } from './resolve';
import type { NavigationStore } from './store';
import type { MoreRequest, NavigationNode, NavigationTree, Rect } from './types';

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

  it('is pending past an edge with unloaded content, before wrapping or bubbling', () => {
    const tree = fakeTree({
      id: 'page',
      kind: 'scope',
      layout: 'vertical',
      children: [
        group('row', 'horizontal', [leaf('a'), leaf('b')], { more: { end: true }, edge: 'wrap' }),
        group('grid', 'grid', [leaf('g1'), leaf('g2'), leaf('g3')], {
          columns: 2,
          more: { end: true },
        }),
        leaf('carousel', { parts: ['0', '1'], more: { end: true } }),
      ],
    });
    expect(move(tree, 'b', 'right')).toEqual({
      type: 'pending',
      groupId: 'row',
      edge: 'end',
      reason: "loading past row's end",
    });
    // Only along the axis, and only at the edge that has more
    expect(move(tree, 'a', 'left')).toMatchObject({ type: 'move', targetId: 'b' });
    expect(move(tree, 'b', 'down')).toMatchObject({ type: 'move', targetId: 'g1' });
    // A grid: Down past the last row, Right past the last child
    expect(move(tree, 'g3', 'down')).toMatchObject({ type: 'pending', groupId: 'grid' });
    expect(move(tree, 'g3', 'right')).toMatchObject({ type: 'pending', groupId: 'grid' });
    // The end of a row that isn't the last one leaves the grid as usual
    expect(move(tree, 'g2', 'right')).toMatchObject({ type: 'unhandled' });
    // A composite past its last part
    expect(resolveMove(tree, 'carousel', 'right', { scopeId: 'page', part: '1' })).toMatchObject({
      type: 'pending',
      groupId: 'carousel',
      edge: 'end',
    });
    // Nothing is loading before its first part
    expect(resolveMove(tree, 'carousel', 'left', { scopeId: 'page', part: '0' })).toMatchObject({
      type: 'unhandled',
    });
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

  it('enters a row below a wide element at its first item, whatever their widths', () => {
    // A full-width field over Save and a wider Cancel
    const field = box(0, 0, 400, 40);
    const row = [
      { id: 'save', rect: box(0, 60, 60, 40) },
      { id: 'cancel', rect: box(70, 60, 90, 40) },
    ];
    expect(spatialPick(field, row, 'down')).toBe('save');
    // A narrow element still picks the item it lies over
    expect(spatialPick(box(100, 0, 20, 40), row, 'down')).toBe('cancel');
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

  it('drops cached rectangles above a child whose eligibility changes', () => {
    let store: NavigationStore | undefined;
    function Grab() {
      store = useNavigationStore();
      return null;
    }
    function Spatial({ disabled }: { disabled: boolean }) {
      return (
        <NavigationProvider>
          <Grab />
          <FocusScope id="page" layout="spatial">
            <Item id="alone" />
            <FocusGroup id="pair" layout="horizontal">
              <Item id="kept" />
              <Item id="toggled" disabled={disabled} />
            </FocusGroup>
          </FocusScope>
        </NavigationProvider>
      );
    }
    const { rerender } = render(<Spatial disabled={false} />);
    press('ArrowRight');
    expect(store!.snapshot().geometry).toContain('page');
    rerender(<Spatial disabled />);
    expect(store!.snapshot().geometry).not.toContain('page');
  });

  describe('pending moves', () => {
    let loadPage: () => void;
    function Paged({ onMore }: { onMore: NonNullable<NavigationNode['onMore']> }) {
      const [count, setCount] = useState(2);
      loadPage = () => setCount(current => current + 2);
      return (
        <NavigationProvider>
          <FocusScope id="page">
            <FocusGroup id="row" layout="horizontal" more={{ end: count < 6 }} onMore={onMore}>
              {Array.from({ length: count }, (_, index) => (
                <Item key={index} id={`item${index + 1}`} />
              ))}
            </FocusGroup>
            <FocusGroup id="lower" layout="horizontal">
              <Item id="below" />
            </FocusGroup>
          </FocusScope>
        </NavigationProvider>
      );
    }
    const arrive = () =>
      act(async () => {
        loadPage();
        await Promise.resolve();
      });

    it('asks once, keeps focus, and moves on when the content arrives', async () => {
      // Still loading: a promise that hasn't settled
      const onMore = vi.fn((_request: MoreRequest) => new Promise<void>(() => undefined));
      render(<Paged onMore={onMore} />);
      press('ArrowRight');
      press('ArrowRight');
      expect(focusedText()).toBe('item2');
      expect(onMore).toHaveBeenCalledTimes(1);
      expect(onMore.mock.calls[0][0]).toMatchObject({ edge: 'end' });
      // The same move again (a held key) waits on the same request
      press('ArrowRight', { repeat: true });
      press('ArrowRight');
      expect(onMore).toHaveBeenCalledTimes(1);
      await arrive();
      expect(focusedText()).toBe('item3');
    });

    it('asks again on a new press after a loader that returned nothing, never on a held key', async () => {
      const onMore = vi.fn();
      render(<Paged onMore={onMore} />);
      press('ArrowRight');
      press('ArrowRight');
      press('ArrowRight', { repeat: true });
      expect(onMore).toHaveBeenCalledTimes(1);
      // Nothing arrived: a new press asks again, and content arriving still completes the move
      press('ArrowRight');
      expect(onMore).toHaveBeenCalledTimes(2);
      expect(focusedText()).toBe('item2');
      await arrive();
      expect(focusedText()).toBe('item3');
    });

    it('asks again after a loader that throws before returning a promise', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const onMore = vi.fn(() => {
        throw new Error('offline');
      });
      render(<Paged onMore={onMore} />);
      press('ArrowRight');
      press('ArrowRight');
      press('ArrowRight');
      expect(focusedText()).toBe('item2');
      expect(onMore).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenCalledTimes(2);
    });

    it('drops the wait when the user moves on, so late content never takes focus', async () => {
      const onMore = vi.fn();
      render(<Paged onMore={onMore} />);
      press('ArrowRight');
      press('ArrowRight');
      press('ArrowDown');
      expect(focusedText()).toBe('below');
      expect((onMore.mock.calls[0][0] as MoreRequest).signal.aborted).toBe(true);
      await arrive();
      expect(focusedText()).toBe('below');

      // Back is a new intent too
      press('ArrowUp');
      press('ArrowRight');
      press('ArrowRight');
      press('ArrowRight');
      expect(focusedText()).toBe('item4');
      expect(onMore).toHaveBeenCalledTimes(2);
      press('Escape');
      expect((onMore.mock.calls[1][0] as MoreRequest).signal.aborted).toBe(true);
      await arrive();
      expect(focusedText()).toBe('item4');
    });

    it('asks again once a load failed or settled without new content', async () => {
      const onMore = vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue(undefined);
      render(<Paged onMore={onMore} />);
      press('ArrowRight');
      await act(async () => {
        press('ArrowRight');
      });
      press('ArrowRight');
      expect(onMore).toHaveBeenCalledTimes(2);
      await act(async () => {});
      press('ArrowRight');
      expect(onMore).toHaveBeenCalledTimes(3);
      expect(focusedText()).toBe('item2');
    });
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

  it('moves to the next row when the row group holding focus is removed', async () => {
    function Rows() {
      const [shown, setShown] = useState(true);
      return (
        <NavigationProvider>
          <FocusScope>
            <FocusGroup id="first" layout="horizontal">
              <Item id="a" />
            </FocusGroup>
            {shown && (
              <FocusGroup id="second" layout="horizontal">
                <Item id="b" />
                <Item id="remove" onClick={() => setShown(false)} />
              </FocusGroup>
            )}
            <FocusGroup id="third" layout="horizontal">
              <Item id="c" />
            </FocusGroup>
          </FocusScope>
        </NavigationProvider>
      );
    }
    render(<Rows />);
    press('ArrowDown');
    press('ArrowRight');
    expect(focusedText()).toBe('remove');
    await act(async () => {
      press('Enter');
      await Promise.resolve();
    });
    expect(focusedText()).toBe('c');
  });

  it('contains focus in an overlay scope, restores the opener and reopens at the start', () => {
    function WithOverlay() {
      const [open, setOpen] = useState(false);
      return (
        <Page>
          <FocusGroup layout="horizontal">
            <Item id="open" onClick={() => setOpen(true)} />
          </FocusGroup>
          {open && (
            <FocusScope id="overlay" contain layout="horizontal">
              <Item id="ok" onClick={() => setOpen(false)} />
              <Item id="cancel" onClick={() => setOpen(false)} />
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

    // Reopened, it starts over instead of entering where it was left
    act(() => {
      press('Enter');
    });
    press('ArrowRight');
    expect(focusedText()).toBe('cancel');
    act(() => {
      press('Enter');
    });
    expect(focusedText()).toBe('open');
    act(() => {
      press('Enter');
    });
    expect(focusedText()).toBe('ok');
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

  describe('geometry', () => {
    /** A 2×2 spatial grid of 50px items; `offset` scrolls it. */
    const positions: Record<string, [number, number]> = {
      a: [0, 0],
      b: [100, 0],
      c: [0, 100],
      d: [100, 100],
      e: [200, 0],
    };
    let offset = 0;
    let reads = 0;
    let store: NavigationStore;
    beforeEach(() => {
      offset = 0;
      reads = 0;
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: Element
      ) {
        const position = positions[this.textContent ?? ''];
        reads += 1;
        const [left, top] = position ?? [0, 0];
        return {
          left,
          top: top + offset,
          right: left + 50,
          bottom: top + offset + 50,
        } as DOMRect;
      });
    });
    function Grab() {
      store = useNavigationStore();
      return null;
    }
    function Spatial({ extra = false }: { extra?: boolean }) {
      return (
        <NavigationProvider>
          <Grab />
          <FocusScope id="page">
            <FocusGroup id="tiles" layout="spatial">
              <Item id="a" />
              <Item id="b" />
              <Item id="c" />
              <Item id="d" />
              {extra && <Item id="e" />}
            </FocusGroup>
          </FocusScope>
        </NavigationProvider>
      );
    }

    it('measures a spatial group once, then reads one anchor per move', () => {
      render(<Spatial />);
      press('ArrowRight');
      expect(focusedText()).toBe('b');
      expect(store.cachedGeometry()).toEqual(['tiles']);
      reads = 0;
      press('ArrowDown');
      expect(focusedText()).toBe('d');
      expect(reads).toBe(1);
    });

    it('shifts the cache with its anchor, so a scroll costs no re-measuring', () => {
      render(<Spatial />);
      press('ArrowDown');
      expect(focusedText()).toBe('c');
      offset = -80;
      reads = 0;
      press('ArrowRight');
      expect(focusedText()).toBe('d');
      press('ArrowUp');
      expect(focusedText()).toBe('b');
      expect(reads).toBe(2);
    });

    it('measures again after a child is added or the window resizes', () => {
      const { rerender } = render(<Spatial />);
      press('ArrowRight');
      rerender(<Spatial extra />);
      expect(store.cachedGeometry()).toEqual([]);
      press('ArrowRight');
      expect(focusedText()).toBe('e');
      expect(store.cachedGeometry()).toEqual(['tiles']);
      fireEvent(window, new Event('resize'));
      expect(store.cachedGeometry()).toEqual([]);
    });

    it('reads no geometry for axis moves', () => {
      render(<Page />);
      reads = 0;
      press('ArrowRight');
      press('ArrowRight');
      expect(focusedText()).toBe('three');
      expect(reads).toBe(0);
    });
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
