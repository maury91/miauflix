import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';

import type { BadgeArtProps } from '../badge/badge.art';
import { useRenderMode } from '../gl';
import type { NavigableProps } from '../navFocus';
import type { TileVisualArt } from './collectionTile.art';
import { CollectionTileDom } from './CollectionTileDom';
import { CollectionTileGl } from './CollectionTileGl';

export type CollectionTileProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'color' | 'className' | 'style' | 'children'
> & {
  /** The tile's name: one line with ellipsis, always read in full. From the feature (i18n). */
  label: string;
  /** One short line under the label: year, episode, "Kids profile". */
  supportingText?: string;
  /**
   * Covers the frame: an Artwork with `ratio="fill"`, or a decorative Avatar with `size="fill"`.
   * Absent, the frame keeps its geometry.
   */
  visual?: ReactNode;
  /** 16:9, 2:3 or 1:1. */
  ratio?: 'landscape' | 'portrait' | 'square';
  /** Text under the frame, or over the artwork on the tile scrim. */
  labelPlacement?: 'below' | 'overlay';
  /**
   * The visual already shows the name (a title logo): the label only names the tile for assistive
   * technology. Supporting text stays visible.
   */
  labelHidden?: boolean;
  /** A Badge at the frame's top start corner. Its text joins the description. */
  badge?: ReactNode;
  /** Watched share, 0 to 1: a decorative hairline at the frame's bottom. */
  progress?: number;
  /** The share in words ("40% watched"), read as part of the description. */
  progressText?: string;
  /** Virtual focus (outline and scale), from the navigation layer. */
  focused?: boolean;
  /** Called when the pointer moves onto the tile. */
  onPointerFocus?: () => void;
  /**
   * Inside a GlSurface: the visual's picture (from the caller's `*.art.ts`). The whole tile is then
   * one baked picture (collectionTile.art.ts) and `visual` isn't rendered.
   */
  glVisual?: TileVisualArt;
  /** Inside a GlSurface: `badge` as a label Badge's picture (the twin keeps `badge` for the reader). */
  glBadge?: BadgeArtProps;
} & NavigableProps;

/**
 * One primary action led by artwork: media tiles, profile choices. Generic: it knows nothing about
 * media DTOs. Quick actions are siblings in the collection's recipe, never inside the tile. Drawn
 * by the GlSurface it's in (CollectionTileGl), or as DOM (CollectionTileDom).
 */
export const CollectionTile = forwardRef<HTMLButtonElement, CollectionTileProps>(
  function CollectionTile(props, ref) {
    return useRenderMode() === 'gl' ? (
      <CollectionTileGl {...props} ref={ref} />
    ) : (
      <CollectionTileDom {...props} ref={ref} />
    );
  }
);
