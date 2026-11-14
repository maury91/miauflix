import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { expect, waitFor, within } from 'storybook/test';

import { StateCell, SurfaceStage } from '../storyHelpers';
import { storyImage } from '../storyImage';
import { color, fontFamily, typeScale } from '../tokens';
import { Artwork } from './Artwork';

import ImageOffIcon from '~icons/mdi/image-off-outline';

const meta = {
  title: 'Design System/Collections/Artwork',
  tags: ['autodocs'],
  component: Artwork,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'An image whose geometry never depends on it. The box keeps its ratio (16:9, 2:3, 1:1, or `fill` to cover a positioned container such as a tile frame) through padding, so Chromium 69 needs no `aspect-ratio`. While loading it shows the placeholder fill; the decoded image fades in with opacity; with no image, or when it fails, a decorative fallback (a title, an icon) shows in the same box. `alt` is empty by default because a label next to it usually names the content. Passive, never focusable.',
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
} satisfies Meta<typeof Artwork>;

export default meta;
type Story = StoryObj<typeof Artwork>;

const cell = (width: string): CSSProperties => ({ width });
const titleFallback: CSSProperties = {
  padding: '0 1rem',
  color: color.text,
  fontFamily,
  fontSize: typeScale.heading.fontSize,
  lineHeight: typeScale.heading.lineHeight,
  fontWeight: typeScale.heading.fontWeight,
};

export const States: Story = {
  render: () => (
    <div>
      <StateCell name="Landscape, loaded">
        <div style={cell('16rem')}>
          <Artwork src={storyImage('#f4d58d', '#3d405b')} />
        </div>
      </StateCell>
      <StateCell name="Portrait, loaded">
        <div style={cell('8rem')}>
          <Artwork src={storyImage('#e07a5f', '#2b2d42')} ratio="portrait" />
        </div>
      </StateCell>
      <StateCell name="Square, contain">
        <div style={cell('8rem')}>
          <Artwork src={storyImage('#8ecae6', '#023047')} ratio="square" fit="contain" />
        </div>
      </StateCell>
      <StateCell name="Failed: title fallback">
        <div style={cell('16rem')} data-testid="failed">
          <Artwork
            src="/missing-artwork.jpg"
            fallback={<span style={titleFallback}>Dune: Part Two</span>}
          />
        </div>
      </StateCell>
      <StateCell name="No image: icon fallback">
        <div style={cell('16rem')}>
          <Artwork fallback={<ImageOffIcon style={{ fontSize: '2rem' }} />} />
        </div>
      </StateCell>
      <StateCell name="Placeholder (loading)">
        <div style={cell('16rem')}>
          <Artwork />
        </div>
      </StateCell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // A failing image is replaced by its fallback in the same box
    await waitFor(() => expect(canvas.getByText('Dune: Part Two')).toBeInTheDocument());
    const failed = canvas.getByTestId('failed').firstElementChild as HTMLElement;
    await expect(failed).toHaveAttribute('data-status', 'failed');
    await expect(failed.querySelector('img')).toBeNull();
    // Geometry is the same as a loaded landscape artwork of the same width
    await expect(failed.getBoundingClientRect().height).toBeCloseTo(256 * 0.5625, 0);
  },
};
