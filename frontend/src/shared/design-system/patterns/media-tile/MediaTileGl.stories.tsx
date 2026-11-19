import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, fireEvent, fn, waitFor, within } from 'storybook/test';

import { GlGroup, type GlRendererStats, GlSurface, useGlAvailable } from '../../gl';
import { SurfaceStage } from '../../storyHelpers';
import { MediaTile } from './MediaTile';

const WIDTH = 640;
const HEIGHT = 220;
const TILE = { width: 280, height: 157.5 };
/** Stand-in artwork as a PNG: the GL pipeline decodes bitmaps (createImageBitmap), not SVG. */
function pngImage(from: string, to: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 320, 180);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 320, 180);
  return canvas.toDataURL('image/png');
}

const TILES = [
  { title: 'Dune', x: 20, art: pngImage('#f4d58d', '#3d405b'), badge: '4K' },
  { title: 'Severance', x: 340, art: pngImage('#8ecae6', '#023047') },
];

interface Props {
  onFocusTile: (title: string) => void;
  onOpenTile: (title: string) => void;
}

const meta = {
  title: 'Design System/Product Patterns/MediaTile/WebGL',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'MediaTile inside a GlSurface, as on the TV: the tile is one baked picture (with its badge), its button stays invisible for focus and the reader. The canvas hit-tests the pointer and forwards moves and clicks to the button. A context lost and not restored within a few seconds falls back to the DOM tiles.',
      },
    },
  },
  args: { onFocusTile: fn(), onOpenTile: fn() },
  decorators: [
    Story => (
      <SurfaceStage surface="solid">
        <Story />
      </SurfaceStage>
    ),
  ],
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<Props>;

/** The tiles drawn by WebGL while it's available, as DOM in the same places once it isn't. */
function Tiles({ onFocusTile, onOpenTile }: Props) {
  const gl = useGlAvailable();
  const tiles = TILES.map(({ title, x, art, badge }) => {
    const tile = (
      <MediaTile
        title={title}
        artwork={art}
        labelPlacement="overlay"
        badge={badge ? { label: badge } : undefined}
        onPointerFocus={() => onFocusTile(title)}
        onClick={() => onOpenTile(title)}
      />
    );
    return gl ? (
      <GlGroup key={title} x={x} y={20} width={TILE.width} height={TILE.height}>
        {tile}
      </GlGroup>
    ) : (
      <Placed key={title} x={x}>
        {tile}
      </Placed>
    );
  });
  return (
    <div style={{ position: 'relative', width: WIDTH, height: HEIGHT }}>
      {gl ? (
        <GlSurface
          width={WIDTH}
          height={HEIGHT}
          style={{ position: 'absolute', top: 0, left: 0 }}
          exposeAs="__glTiles"
        >
          {/* The buttons the tiles draw over: invisible, out of the pointer's way (as Home's) */}
          <div style={{ opacity: 0, pointerEvents: 'none' }}>{tiles}</div>
        </GlSurface>
      ) : (
        tiles
      )}
    </div>
  );
}

function Placed({ x, children }: { x: number; children: ReactNode }) {
  return (
    <div style={{ position: 'absolute', top: 20, left: x, width: TILE.width }}>{children}</div>
  );
}

const glStats = () =>
  (window as unknown as { __glTiles?: { stats: GlRendererStats } }).__glTiles?.stats;

export const PointerAndFallback: Story = {
  render: args => <Tiles {...args} />,
  play: async ({ args, canvasElement, step }) => {
    const host = await waitFor(() => {
      const canvas = canvasElement.querySelector('canvas');
      expect(canvas).not.toBeNull();
      return canvas!.parentElement!;
    });
    await waitFor(() => expect(glStats()?.artBakes).toBeGreaterThanOrEqual(2), {
      timeout: 10_000,
    });
    const at = (x: number, y: number) => {
      const box = host.getBoundingClientRect();
      return { clientX: box.left + x, clientY: box.top + y };
    };

    await step('the pointer over a drawn tile reaches its button', async () => {
      fireEvent.mouseMove(host, at(100, 80));
      await expect(args.onFocusTile).toHaveBeenLastCalledWith('Dune');
      fireEvent.mouseMove(host, at(400, 80));
      await expect(args.onFocusTile).toHaveBeenLastCalledWith('Severance');
      fireEvent.click(host, at(400, 80));
      await expect(args.onOpenTile).toHaveBeenCalledWith('Severance');
      // Between the tiles: nothing
      fireEvent.click(host, at(310, 80));
      await expect(args.onOpenTile).toHaveBeenCalledTimes(1);
    });

    await step('a context lost for good falls back to the DOM tiles', async () => {
      const canvas = host.querySelector('canvas')!;
      const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      context!.getExtension('WEBGL_lose_context')!.loseContext();
      await waitFor(() => expect(canvasElement.querySelector('canvas')).toBeNull(), {
        timeout: 6000,
      });
      const dune = within(canvasElement).getByRole('button', { name: 'Dune' });
      await expect(dune.getBoundingClientRect().width).toBeCloseTo(TILE.width, 0);
      fireEvent.click(dune);
      await expect(args.onOpenTile).toHaveBeenLastCalledWith('Dune');
    });
  },
};
