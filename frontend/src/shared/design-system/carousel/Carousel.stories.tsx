import type { MoreRequest } from '@shared/navigation/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useEffect, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { Artwork } from '../artwork/Artwork';
import { CollectionTile } from '../collection-tile/CollectionTile';
import { NavigationStage } from '../storyHelpers';
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
          'A horizontal row on the collection geometry (Home\'s tuned sizes from the window size): whole items centred with up to half an item peeking on each side, placed and moved by `translateX`, with only the items near the visible ones mounted. `useCarouselNavigation` owns the position: Left/Right move one item into the left-most slot (`paging="item"`, Home today) or scroll by a page and focus the item landing there (`"page"`), and leave the row at the ends; the last page is always full. The pointer focuses without scrolling, and is ignored while a scroll animates and for the synthetic events after it. On the web, page buttons over the peek scroll for the pointer. Each row keeps its own position, so returning to it returns to the same item. A paginated row (`hasMore`, `onLoadMore`) holds focus on its last loaded item while the next page loads, then moves on unless the user went elsewhere.',
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
  /** A paginated row: items load a page at a time up to `count`. */
  pageSize?: number;
}

/** The story's stand-in for a paginated request: a delay, abandoned when the signal aborts. */
const loadDelay = 400;

function Row({
  spec,
  geometry,
  onOpen,
}: {
  spec: RowSpec;
  geometry: CollectionGeometry;
  onOpen: (label: string) => void;
}) {
  const [loaded, setLoaded] = useState(spec.pageSize ?? spec.count);
  const [loading, setLoading] = useState(false);
  const navigation = useCarouselNavigation({
    count: loaded,
    perPage: geometry.perPage,
    paging: spec.paging,
  });

  const loadMore = ({ signal }: MoreRequest) =>
    new Promise<void>(resolve => {
      setLoading(true);
      const timer = window.setTimeout(() => {
        setLoaded(count => Math.min(spec.count, count + (spec.pageSize ?? spec.count)));
        setLoading(false);
        resolve();
      }, loadDelay);
      signal.addEventListener('abort', () => {
        // A real feature would cancel the request; the story drops the page
        window.clearTimeout(timer);
        setLoading(false);
        resolve();
      });
    });

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
        {loading && <span style={captionStyle}> · Loading more…</span>}
      </h2>
      <Carousel
        labelledBy={`${spec.id}-title`}
        count={loaded}
        geometry={geometry}
        navId={spec.id}
        navigation={navigation}
        hasMore={loaded < spec.count}
        onLoadMore={loadMore}
        renderItem={renderItem}
        pageButtons={{
          previousLabel: `Previous ${spec.title}`,
          nextLabel: `Next ${spec.title}`,
          onPage: navigation.page,
        }}
      />
    </div>
  );
}

const captionStyle = {
  color: color.textSecondary,
  fontSize: typeScale.caption.fontSize,
  fontWeight: 400,
};

/** Home's rows on the navigation layer: Up/Down between rows, each row keeps its item. */
function Rows({ rows }: { rows: RowSpec[] }) {
  const geometry = collectionGeometry(useWindowSize());
  const [opened, setOpened] = useState('');

  return (
    <NavigationStage>
      <div style={{ minHeight: '100vh', backgroundColor: color.canvas, paddingBottom: space.lg }}>
        {rows.map(spec => (
          <Row key={spec.id} spec={spec} geometry={geometry} onOpen={setOpened} />
        ))}
        <p style={{ ...titleStyle, ...captionStyle }}>Opened: {opened}</p>
      </div>
    </NavigationStage>
  );
}

const homeRows: RowSpec[] = [
  { id: 'trending', title: 'Trending', count: 20, paging: 'item' },
  { id: 'continue', title: 'Continue watching', count: 12, paging: 'item' },
];

/**
 * Left/Right move one item into the left-most slot; Up/Down change rows, and each row returns to
 * its own item. Left on the first item leaves the row (here, nothing is there).
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
    await expect(tile('Trending 1')).toHaveAttribute('data-focused');

    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{ArrowRight}');
    await expect(tile('Trending 3')).toHaveAttribute('data-focused');
    // The focused item is brought to the leading slot
    await expect(track.style.transform).not.toBe('translateX(0px)');
    // Only the items near the visible ones are mounted
    await expect(trending.querySelectorAll('li').length).toBeLessThan(20);
    await expect(trending.querySelector('li')).toHaveAttribute('aria-setsize', '20');

    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowRight}');
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
    // A page further: the page size depends on the window, and the last page is always full.
    // With every item on one page there is nothing to scroll, so focus moves one item
    const { perPage } = collectionGeometry({
      width: window.innerWidth,
      height: window.innerHeight,
    });
    const leading = Math.min(perPage, Math.max(0, 14 - perPage));
    const expected = leading > 0 ? leading + 1 : 2;
    await waitFor(() => expect(focusedLabel()).toBe(`Popular ${expected}`));
  },
};

/** Fewer items than a page: no peek fades, no page buttons, nothing to scroll. */
export const ShortRow: Story = {
  render: () => <Rows rows={[{ id: 'new', title: 'New this week', count: 2, paging: 'item' }]} />,
};

/**
 * A paginated row: Right on the last loaded item waits while the next page loads, then moves on.
 * Moving elsewhere meanwhile abandons the wait: the page still arrives, but never takes focus.
 */
export const LoadMore: Story = {
  render: () => (
    <Rows
      rows={[
        { id: 'search', title: 'Results', count: 12, paging: 'item', pageSize: 4 },
        { id: 'related', title: 'Related', count: 6, paging: 'item' },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tile = (name: string) => canvas.getByRole('button', { name });
    for (let press = 0; press < 3; press++) await userEvent.keyboard('{ArrowRight}');
    await expect(tile('Results 4')).toHaveAttribute('data-focused');

    // The edge of what is loaded: focus stays while the next page loads, then moves on
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByText(/Loading more/)).toBeInTheDocument();
    await expect(tile('Results 4')).toHaveAttribute('data-focused');
    await waitFor(() => expect(tile('Results 5')).toHaveAttribute('data-focused'));

    // Leaving while the next page loads: it never takes focus back
    for (let press = 0; press < 3; press++) await userEvent.keyboard('{ArrowRight}');
    await expect(tile('Results 8')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{ArrowDown}');
    await expect(tile('Related 1')).toHaveAttribute('data-focused');
    await new Promise(resolve => setTimeout(resolve, loadDelay + 200));
    await expect(tile('Related 1')).toHaveAttribute('data-focused');
    await expect(canvas.queryByText(/Loading more/)).toBeNull();
  },
};
