import { getKeyboardAction } from '@shared/hooks/useKeyboard';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { Artwork } from '../artwork/Artwork';
import { CollectionTile } from '../collection-tile/CollectionTile';
import { storyImage } from '../storyImage';
import { color, fontFamily, space, typeScale } from '../tokens';
import { Carousel, type CarouselItemState } from './Carousel';
import { type CarouselLayout, useCarouselNavigation } from './carouselNavigation';
import { type CollectionGeometry, collectionGeometry } from './collectionGeometry';

const meta = {
  title: 'Design System/Collections/Carousel',
  tags: ['autodocs'],
  component: Carousel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A horizontal row on the collection geometry (Home\'s tuned sizes from the window size): whole items centred with up to half an item peeking on each side, placed and moved by `translateX`, with only the items near the visible ones mounted. `useCarouselNavigation` owns the position: Left/Right move one item into the left-most slot (`paging="item"`, Home today) or scroll by a page and focus the item landing there (`"page"`), and report an exit at the ends; the last page is always full. The pointer focuses without scrolling, and is ignored while a scroll animates and for the synthetic events after it. On the web, page buttons over the peek scroll for the pointer. Each row keeps its own position, so returning to it returns to the same item.',
      },
    },
  },
  args: {
    count: 0,
    renderItem: () => null,
    geometry: collectionGeometry({ width: 1280, height: 720 }),
    focusedIndex: null,
    leadingIndex: 0,
  },
} satisfies Meta<typeof Carousel>;

export default meta;
type Story = StoryObj<typeof Carousel>;

function useWindowSize() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

const palette = [
  ['#f4d58d', '#3d405b'],
  ['#8ecae6', '#023047'],
  ['#e07a5f', '#2b2d42'],
  ['#b5e48c', '#1e6091'],
  ['#cdb4db', '#3a0ca3'],
  ['#ffb703', '#7f5539'],
] as const;
const images = palette.map(([from, to]) => storyImage(from, to));

const titleStyle = {
  margin: `${space.md} 0 ${space.xs}`,
  padding: '0 5vw',
  color: color.text,
  fontFamily,
  fontSize: typeScale.heading.fontSize,
  lineHeight: typeScale.heading.lineHeight,
  fontWeight: typeScale.heading.fontWeight,
  textTransform: 'none' as const,
};

interface RowSpec {
  id: string;
  title: string;
  count: number;
  paging: CarouselLayout['paging'];
}

interface RowHandlers {
  move: (direction: -1 | 1) => boolean;
  open: () => void;
}

function Row({
  spec,
  active,
  geometry,
  handlers,
  onPointerEnter,
  onOpen,
}: {
  spec: RowSpec;
  active: boolean;
  geometry: CollectionGeometry;
  handlers: Map<string, RowHandlers>;
  onPointerEnter: (id: string) => void;
  onOpen: (label: string) => void;
}) {
  const navigation = useCarouselNavigation({
    count: spec.count,
    perPage: geometry.perPage,
    paging: spec.paging,
  });
  const { focusedIndex, move } = navigation;
  useEffect(() => {
    handlers.set(spec.id, { move, open: () => onOpen(`${spec.title} ${focusedIndex + 1}`) });
  }, [focusedIndex, handlers, move, onOpen, spec.id, spec.title]);

  const renderItem = useCallback(
    (index: number, { focused }: CarouselItemState) => (
      <CollectionTile
        label={`${spec.title} ${index + 1}`}
        labelPlacement="overlay"
        visual={<Artwork src={images[index % images.length]} ratio="fill" />}
        focused={focused}
        tabIndex={-1}
        onClick={() => onOpen(`${spec.title} ${index + 1}`)}
      />
    ),
    [onOpen, spec.title]
  );

  return (
    <div>
      <h2 id={`${spec.id}-title`} style={titleStyle}>
        {spec.title}
      </h2>
      <Carousel
        labelledBy={`${spec.id}-title`}
        count={spec.count}
        geometry={geometry}
        focusedIndex={active ? focusedIndex : null}
        leadingIndex={navigation.leadingIndex}
        renderItem={renderItem}
        onPointerFocus={index => {
          onPointerEnter(spec.id);
          navigation.pointerFocus(index);
        }}
        pageButtons={{
          previousLabel: `Previous ${spec.title}`,
          nextLabel: `Next ${spec.title}`,
          onPage: navigation.page,
        }}
      />
    </div>
  );
}

/** Story-only stand-in for Home's navigation: Up/Down between rows, each row keeps its position. */
function Rows({ rows }: { rows: RowSpec[] }) {
  const geometry = collectionGeometry(useWindowSize());
  const [activeRow, setActiveRow] = useState(rows[0].id);
  const [opened, setOpened] = useState('');
  const [edge, setEdge] = useState('');
  const [handlers] = useState(() => new Map<string, RowHandlers>());
  const activeRef = useRef(activeRow);
  activeRef.current = activeRow;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = getKeyboardAction(event);
      const row = handlers.get(activeRef.current);
      if (!row) return;
      if (action === 'left' || action === 'right') {
        event.preventDefault();
        const moved = row.move(action === 'left' ? -1 : 1);
        setEdge(moved ? '' : `· exit ${action}`);
      } else if (action === 'up' || action === 'down') {
        event.preventDefault();
        const index = rows.findIndex(item => item.id === activeRef.current);
        const next = rows[index + (action === 'up' ? -1 : 1)];
        if (next) setActiveRow(next.id);
      } else if (action === 'confirm') {
        event.preventDefault();
        row.open();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers, rows]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: color.canvas, paddingBottom: space.lg }}>
      {rows.map(spec => (
        <Row
          key={spec.id}
          spec={spec}
          active={spec.id === activeRow}
          geometry={geometry}
          handlers={handlers}
          onPointerEnter={setActiveRow}
          onOpen={setOpened}
        />
      ))}
      <p
        style={{ ...titleStyle, color: color.textSecondary, fontSize: typeScale.caption.fontSize }}
      >
        Opened: {opened} {edge}
      </p>
    </div>
  );
}

const homeRows: RowSpec[] = [
  { id: 'trending', title: 'Trending', count: 20, paging: 'item' },
  { id: 'continue', title: 'Continue watching', count: 12, paging: 'item' },
];

/**
 * Left/Right move one item into the left-most slot; Up/Down change rows, and each row returns to
 * its own item. Left on the first item exits.
 */
export const HomeRows: Story = {
  render: () => <Rows rows={homeRows} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tile = (name: string) => canvas.getByRole('button', { name });
    const trending = canvas.getByRole('region', { name: 'Trending' });
    const track = trending.querySelector('ul') as HTMLElement;

    await expect(tile('Trending 1')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowLeft}');
    await expect(canvas.getByText(/exit left/)).toBeInTheDocument();

    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await expect(tile('Trending 3')).toHaveAttribute('data-focused');
    // The focused item is brought to the leading slot
    await expect(track.style.transform).not.toBe('translateX(0px)');
    // Only the items near the visible ones are mounted
    await expect(trending.querySelectorAll('li').length).toBeLessThan(20);
    await expect(trending.querySelector('li')).toHaveAttribute('aria-setsize', '20');

    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    await expect(tile('Continue watching 2')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowUp}');
    await expect(tile('Trending 3')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByText(/Opened: Trending 3/)).toBeInTheDocument();
  },
};

/** `paging="page"`: Left/Right scroll a whole page and focus the item landing in the first slot. */
export const PagePaging: Story = {
  render: () => <Rows rows={[{ id: 'popular', title: 'Popular', count: 14, paging: 'page' }]} />,
  play: async ({ canvasElement }) => {
    const focusedLabel = () =>
      canvasElement.querySelector('li[data-focused] [id$="-label"]')?.textContent;
    await expect(focusedLabel()).toBe('Popular 1');
    await userEvent.keyboard('{ArrowRight}');
    // A page further than one item (at least two items fit in the story's window)
    await waitFor(() => expect(focusedLabel()).not.toBe('Popular 1'));
    await expect(focusedLabel()).not.toBe('Popular 2');
  },
};

/** Fewer items than a page: no peek fades, no page buttons, nothing to scroll. */
export const ShortRow: Story = {
  render: () => <Rows rows={[{ id: 'new', title: 'New this week', count: 2, paging: 'item' }]} />,
};
