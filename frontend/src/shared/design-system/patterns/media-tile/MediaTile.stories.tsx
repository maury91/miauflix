import { FocusGroup } from '@shared/navigation/NavigationProvider';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type CSSProperties, useCallback } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Carousel, type CarouselItemState } from '../../carousel/Carousel';
import { useCarouselNavigation } from '../../carousel/carouselNavigation';
import { collectionGeometry } from '../../carousel/collectionGeometry';
import { Grid, GridItem } from '../../layout/Grid';
import { InitialFocus, NavigationStage, StateCell, SurfaceStage } from '../../storyHelpers';
import { storyImage } from '../../storyImage';
import { space } from '../../tokens';
import { MediaTile } from './MediaTile';

const meta = {
  title: 'Design System/Product Patterns/MediaTile',
  tags: ['autodocs'],
  component: MediaTile,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A movie or show in a collection, the same tile in Home rows, Search results and related media: a CollectionTile with Artwork (a landscape backdrop with its title logo, or a portrait poster), a quality Badge and the watched progress. Features adapt their media data into formatted text and image URLs; the collection owns movement. Missing or failing artwork shows the title in the same box.',
      },
    },
  },
  args: { title: 'Title' },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof MediaTile>;

export default meta;
type Story = StoryObj<typeof MediaTile>;

const backdrops = [
  storyImage('#f4d58d', '#3d405b'),
  storyImage('#8ecae6', '#023047'),
  storyImage('#e07a5f', '#2b2d42'),
  storyImage('#b5e48c', '#1e6091'),
];
const logo = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 30"><text x="0" y="24" font-family="sans-serif" font-size="26" font-weight="700" fill="white">DUNE</text></svg>'
)}`;
const slot = (width: string): CSSProperties => ({
  display: 'inline-block',
  verticalAlign: 'top',
  width,
  marginRight: space.lg,
});

export const States: Story = {
  render: () => (
    <div>
      <StateCell name="Backdrop with logo, badge, progress">
        <div style={slot('16rem')}>
          <MediaTile
            title="Dune: Part Two"
            supportingText="2024 · 2 h 46 min"
            artwork={backdrops[0]}
            logo={logo}
            badge={{ label: '4K', accessibleLabel: 'Ultra HD' }}
            progress={0.4}
            progressText="40% watched"
          />
        </div>
      </StateCell>
      <StateCell name="Focused poster">
        <div style={slot('9rem')}>
          <MediaTile
            title="The Expanse"
            supportingText="2015"
            artwork={backdrops[1]}
            ratio="portrait"
            focused
          />
        </div>
      </StateCell>
      <StateCell name="Missing artwork">
        <div style={slot('16rem')}>
          <MediaTile title="A title without artwork" supportingText="2023" artwork={null} />
        </div>
      </StateCell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dune = canvas.getByRole('button', { name: 'Dune: Part Two' });
    // The title names it; the rest describes it, the logo is decorative
    await expect(dune).toHaveAccessibleDescription('2024 · 2 h 46 min Ultra HD 40% watched');
    await expect(canvas.getByRole('button', { name: 'A title without artwork' })).toBeVisible();
  },
};

const titles = ['Dune: Part Two', 'The Expanse', 'Arrival', 'Blade Runner 2049', 'Interstellar'];

function Row() {
  const geometry = collectionGeometry({ width: window.innerWidth, height: window.innerHeight });
  const navigation = useCarouselNavigation({
    count: titles.length,
    perPage: geometry.perPage,
    paging: 'item',
  });
  const renderItem = useCallback(
    (index: number, { focused }: CarouselItemState) => (
      <MediaTile
        title={titles[index]}
        artwork={backdrops[index % backdrops.length]}
        progress={0.2 * (index + 1)}
        focused={focused}
        tabIndex={-1}
      />
    ),
    []
  );
  return (
    <Carousel
      label="Continue watching"
      count={titles.length}
      geometry={geometry}
      navId="row"
      navigation={navigation}
      renderItem={renderItem}
    />
  );
}

/** The same tile in a Home row and in Search results. */
export const RowAndResults: Story = {
  render: () => (
    <NavigationStage>
      <div style={{ marginBottom: space.xl }}>
        <Row />
      </div>
      <FocusGroup id="results" layout="grid" columns={4}>
        <Grid columns={4} gap="md" as="ul" aria-label="Results">
          {titles.slice(0, 4).map((title, index) => (
            <GridItem key={title} as="li">
              <MediaTile title={title} artwork={backdrops[index]} navId={`result:${title}`} />
            </GridItem>
          ))}
        </Grid>
      </FocusGroup>
      <InitialFocus id="result:Dune: Part Two" />
    </NavigationStage>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const results = within(canvas.getByRole('list', { name: 'Results' }));
    await expect(results.getByRole('button', { name: 'Dune: Part Two' })).toHaveAttribute(
      'data-focused'
    );
    await userEvent.keyboard('{ArrowRight}');
    await expect(results.getByRole('button', { name: 'The Expanse' })).toHaveAttribute(
      'data-focused'
    );
    // Up leaves the results for the row above, the same tile there
    await userEvent.keyboard('{ArrowUp}');
    const row = within(canvas.getByRole('region', { name: 'Continue watching' }));
    await expect(row.getAllByRole('button')[0]).toHaveAttribute('data-focused');
  },
};
