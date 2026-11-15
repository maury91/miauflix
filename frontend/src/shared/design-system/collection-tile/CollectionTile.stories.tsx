import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Artwork } from '../artwork/Artwork';
import { Avatar } from '../avatar/Avatar';
import { Badge } from '../badge/Badge';
import { NavigationStage, StateCell, SurfaceStage } from '../storyHelpers';
import { storyImage } from '../storyImage';
import { space } from '../tokens';
import { CollectionTile } from './CollectionTile';

const meta = {
  title: 'Design System/Collections/CollectionTile',
  tags: ['autodocs'],
  component: CollectionTile,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'One primary action led by artwork (media tiles, profile choices). Tiles cannot invert: virtual focus is the white outline around the frame plus the tuned 1.03 scale (150 ms ease-out). The tile fills the width its collection gives it, and the frame keeps its ratio (16:9, 2:3, 1:1) while artwork loads or when it is missing. Text sits under the frame or over the artwork on the tile scrim; the label is one line with ellipsis. A Badge sits at the top start corner and a decorative progress hairline at the bottom; both join the description, the label alone is the name.',
      },
    },
  },
  args: { label: 'Tile' },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<typeof CollectionTile>;

export default meta;
type Story = StoryObj<typeof CollectionTile>;

const art = [
  storyImage('#f4d58d', '#3d405b'),
  storyImage('#8ecae6', '#023047'),
  storyImage('#e07a5f', '#2b2d42'),
  storyImage('#b5e48c', '#1e6091'),
];
const image = (index: number) => <Artwork src={art[index % art.length]} ratio="fill" />;

const slot = (width: string): CSSProperties => ({
  display: 'inline-block',
  verticalAlign: 'top',
  width,
  marginRight: space.lg,
});

/** Focus is virtual: here it is set directly. */
export const States: Story = {
  render: () => (
    <div>
      <StateCell name="Landscape, text below">
        <div style={slot('16rem')}>
          <CollectionTile
            label="Dune: Part Two"
            supportingText="2024 · 2 h 46 min"
            visual={image(0)}
          />
        </div>
      </StateCell>
      <StateCell name="Focused, overlay text, badge and progress">
        <div style={slot('16rem')}>
          <CollectionTile
            label="The Expanse"
            supportingText="S2 · E4 The long night"
            visual={image(1)}
            labelPlacement="overlay"
            badge={<Badge accessibleLabel="Ultra HD">4K</Badge>}
            progress={0.4}
            progressText="40% watched"
            focused
          />
        </div>
      </StateCell>
      <StateCell name="Missing artwork, long label">
        <div style={slot('16rem')}>
          <CollectionTile
            label="A very long title that does not fit on one line of the tile"
            supportingText="Artwork unavailable"
          />
        </div>
      </StateCell>
      <StateCell name="Portrait">
        <div style={slot('9rem')}>
          <CollectionTile
            label="Arrival"
            supportingText="2016"
            ratio="portrait"
            visual={image(2)}
          />
        </div>
      </StateCell>
      <StateCell name="Square (profile), disabled">
        <div style={slot('8rem')}>
          <CollectionTile
            label="Guest"
            ratio="square"
            visual={
              <Avatar
                name="Guest"
                src={storyImage('#cdb4db', '#3a0ca3')}
                size="fill"
                color="#3d6b5c"
                decorative
              />
            }
            disabled
          />
        </div>
      </StateCell>
    </div>
  ),
};

const titles = ['Dune: Part Two', 'The Expanse', 'Arrival', 'Severance'];

function Row() {
  return (
    <NavigationStage layout="horizontal">
      <div style={{ padding: `${space.xs} 0` }}>
        {titles.map((title, index) => (
          <div key={title} style={slot('14rem')}>
            <CollectionTile
              label={title}
              supportingText={index === 1 ? 'S2 · E4' : undefined}
              visual={image(index)}
              labelPlacement="overlay"
              progress={index === 1 ? 0.65 : undefined}
              progressText={index === 1 ? '65% watched' : undefined}
              navId={title}
            />
          </div>
        ))}
      </div>
    </NavigationStage>
  );
}

/**
 * Left/Right move along the row; the pointer focuses what it moves onto. The collection (Carousel,
 * later) owns movement and scrolling; the tile only draws focus.
 */
export const VirtualFocus: Story = {
  render: () => <Row />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tile = (name: string) => canvas.getByRole('button', { name });

    await expect(tile('Dune: Part Two')).toHaveAttribute('data-focused');
    await userEvent.keyboard('{ArrowRight}');
    const expanse = tile('The Expanse');
    await expect(expanse).toHaveAttribute('data-focused');
    await expect(expanse).toHaveAccessibleDescription('S2 · E4 65% watched');
    await userEvent.hover(tile('Severance'));
    await expect(tile('Severance')).toHaveAttribute('data-focused');
  },
};
