import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Artwork } from '../artwork/Artwork';
import { Button } from '../button/Button';
import { CollectionTile } from '../collection-tile/CollectionTile';
import { StateCell, SurfaceStage } from '../storyHelpers';
import { storyImage } from '../storyImage';
import { space } from '../tokens';
import { Skeleton, SkeletonGroup } from './Skeleton';

const meta = {
  title: 'Design System/Feedback/Skeleton',
  tags: ['autodocs'],
  component: Skeleton,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "Placeholder geometry for loading content: each shape takes exactly the box of what replaces it (Artwork's ratios, Avatar's sizes, a text role's line height), so nothing moves when the content arrives. Always hidden from assistive technology; the loading region says it is loading once. It pulses with opacity (a SkeletonGroup pulses its placeholders together, as one layer) and stays still with reduced motion.",
      },
    },
  },
  args: { shape: 'text' },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

const column = { width: '14rem' };

function Shapes() {
  return (
    <>
      <StateCell name="Text: heading">
        <div style={column}>
          <Skeleton shape="text" type="heading" width="10rem" />
        </div>
      </StateCell>
      <StateCell name="Text: body, 3 lines">
        <div style={column}>
          <Skeleton shape="text" lines={3} />
        </div>
      </StateCell>
      <StateCell name="Box: landscape">
        <div style={column}>
          <Skeleton shape="box" ratio="landscape" />
        </div>
      </StateCell>
      <StateCell name="Box: portrait">
        <div style={{ width: '7rem' }}>
          <Skeleton shape="box" ratio="portrait" />
        </div>
      </StateCell>
      <StateCell name="Box: height, full radius">
        <Skeleton shape="box" width="8rem" height="2.5rem" radius="full" />
      </StateCell>
      <StateCell name="Circles: sm, md, lg">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Skeleton shape="circle" size="sm" />
          <span style={{ width: space.sm }} />
          <Skeleton shape="circle" size="md" />
          <span style={{ width: space.sm }} />
          <Skeleton shape="circle" size="lg" />
        </div>
      </StateCell>
    </>
  );
}

export const OnCanvas: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <Shapes />
    </SurfaceStage>
  ),
  play: async ({ canvasElement }) => {
    const placeholders = canvasElement.querySelectorAll('[aria-hidden="true"]');
    await expect(placeholders.length).toBeGreaterThan(0);
    // Nothing a placeholder draws reaches assistive technology
    await expect(within(canvasElement).queryAllByRole('img')).toHaveLength(0);
  },
};

export const OverMedia: Story = {
  render: () => (
    <SurfaceStage surface="overMedia">
      <Shapes />
    </SurfaceStage>
  ),
};

const tileWidth = '16rem';

/** A CollectionTile's placeholder: the landscape frame, then the label and supporting lines. */
function TilePlaceholder() {
  return (
    <div style={{ width: tileWidth }} data-testid="placeholder">
      <SkeletonGroup>
        <Skeleton shape="box" ratio="landscape" />
        <div style={{ paddingTop: space.xs }}>
          <Skeleton shape="text" type="label" width="70%" />
          <div style={{ marginTop: space['2xs'] }}>
            <Skeleton shape="text" type="caption" width="40%" />
          </div>
        </div>
      </SkeletonGroup>
    </div>
  );
}

function LoadingTile() {
  const [loaded, setLoaded] = useState(false);
  return (
    <div>
      <div aria-busy={!loaded} style={{ marginBottom: space.lg }}>
        {loaded ? (
          <div style={{ width: tileWidth }} data-testid="tile">
            <CollectionTile
              label="Dune: Part Two"
              supportingText="2024"
              visual={<Artwork src={storyImage('#e07a5f', '#3d405b')} ratio="fill" />}
            />
          </div>
        ) : (
          <TilePlaceholder />
        )}
      </div>
      <Button onClick={() => setLoaded(value => !value)}>{loaded ? 'Reload' : 'Load'}</Button>
    </div>
  );
}

/**
 * A loading tile is a SkeletonGroup laid out as the tile: the same frame ratio and text line
 * heights, so the tile takes exactly the placeholder's place when it loads.
 */
export const LoadingToLoaded: Story = {
  render: () => (
    <SurfaceStage surface="solid">
      <LoadingTile />
    </SurfaceStage>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const placeholderHeight = canvas.getByTestId('placeholder').getBoundingClientRect().height;
    await userEvent.click(canvas.getByRole('button', { name: 'Load' }));
    const tileHeight = canvas.getByTestId('tile').getBoundingClientRect().height;
    await expect(Math.abs(tileHeight - placeholderHeight)).toBeLessThan(0.5);
  },
};
