import {
  type ButtonHTMLAttributes,
  forwardRef,
  type ReactNode,
  useId,
  useLayoutEffect,
  useMemo,
} from 'react';

import { visuallyHidden } from '../a11y.css';
import { GlParentProvider, remPx, useGlNode, useGlPaint, useGlParent } from '../gl';
import { joinIds } from '../ids';
import { type NavigableProps, useNavFocus } from '../navFocus';
import { ProgressBar } from '../progress/Progress';
import { radius } from '../tokens';
import * as styles from './collectionTile.css';
import {
  collectionTileArt,
  paintFocusRing,
  paintTileFrame,
  paintTileOverlay,
  TILE_RATIO,
  type TileVisualGl,
} from './CollectionTile.gl';
import { useFocusAnchor } from './focusAnchor';

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
   * Inside a GlSurface: the visual's GL form (from the caller's `.gl.ts`). The whole tile is then
   * one baked picture (CollectionTile.gl.ts) and `visual` isn't rendered.
   */
  glVisual?: TileVisualGl;
} & NavigableProps;

/**
 * One primary action led by artwork: media tiles, profile choices. Generic: it knows nothing about
 * media DTOs. Quick actions are siblings in the collection's recipe, never inside the tile.
 */
export const CollectionTile = forwardRef<HTMLButtonElement, CollectionTileProps>(
  function CollectionTile(
    {
      label,
      supportingText,
      visual,
      ratio = 'landscape',
      labelPlacement = 'below',
      labelHidden = false,
      badge,
      progress,
      progressText,
      focused = false,
      onPointerFocus,
      glVisual,
      type = 'button',
      onMouseMove,
      navId,
      'aria-describedby': callerDescribedBy,
      ...props
    },
    forwardedRef
  ) {
    const id = useId();
    const nav = useNavFocus(navId, { focused, disabled: props.disabled }, forwardedRef);
    const labelId = `${id}-label`;
    const describedBy = joinIds(
      callerDescribedBy,
      supportingText && `${id}-supporting`,
      Boolean(badge) && `${id}-badge`,
      progressText && `${id}-progress`
    );
    const hasProgress = progress !== undefined;

    // GL form (inside a GlSurface): the frame, scrim, progress, text and focus outline are drawn
    // by the renderer; the button stays for focus. With `glVisual` the tile is one baked picture
    // and only the outline is live; otherwise the visual registers its own nodes in the frame.
    const glParent = useGlParent();
    const tileNode = useGlNode();
    const visualNode = useGlNode(tileNode);
    const overlayNode = useGlNode(tileNode);
    const tileWidth = glParent?.width ?? 0;
    const frameHeight = tileWidth * TILE_RATIO[ratio];
    const active = nav.focused && !props.disabled;
    // Under a GlFocusAnchor the outline is drawn once, where the focused tile rests
    const focusAnchor = useFocusAnchor();
    const anchor = glParent ? focusAnchor : null;
    useLayoutEffect(() => {
      if (!anchor) return;
      anchor.set(id, active);
      return () => anchor.set(id, false);
    }, [anchor, active, id]);
    useLayoutEffect(() => {
      if (!tileNode || !overlayNode) return;
      tileNode.set({
        width: tileWidth,
        height: frameHeight,
        // On the TV the focus scale applies at once (collectionTile.css.ts)
        scale: active ? 1.03 : 1,
        opacity: props.disabled ? 0.4 : 1,
      });
      overlayNode.set({ z: 1 });
    });
    const art =
      glParent && glVisual
        ? collectionTileArt(
            {
              label,
              supportingText,
              ratio,
              labelPlacement,
              labelHidden,
              progress,
              width: tileWidth,
            },
            glVisual
          )
        : null;
    useGlPaint(
      tileNode,
      painter => {
        if (art) painter.art(art);
        else paintTileFrame(painter, tileWidth, frameHeight);
      },
      [art?.key, tileWidth, frameHeight]
    );
    useGlPaint(
      overlayNode,
      painter => {
        if (!art)
          paintTileOverlay(painter, {
            width: tileWidth,
            height: frameHeight,
            label: labelHidden ? undefined : label,
            supportingText,
            labelPlacement,
            progress,
          });
        if (active && !anchor) paintFocusRing(painter, tileWidth, frameHeight);
      },
      [
        anchor,
        art?.key,
        tileWidth,
        frameHeight,
        labelHidden,
        label,
        supportingText,
        labelPlacement,
        progress,
        active,
      ]
    );
    const visualValue = useMemo(
      () =>
        glParent && visualNode
          ? {
              renderer: glParent.renderer,
              node: visualNode,
              width: tileWidth,
              height: frameHeight,
              radius: remPx(radius.md),
            }
          : null,
      [frameHeight, glParent, tileWidth, visualNode]
    );
    if (visualValue) {
      return (
        <button
          {...props}
          ref={nav.ref}
          type={type}
          className={styles.glTile}
          data-focused={nav.focused || undefined}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          onMouseMove={event => {
            nav.onPointerFocus();
            onPointerFocus?.();
            onMouseMove?.(event);
          }}
        >
          <span id={labelId}>{label}</span>
          {supportingText && <span id={`${id}-supporting`}>{supportingText}</span>}
          {badge && <span id={`${id}-badge`}>{badge}</span>}
          {progressText && <span id={`${id}-progress`}>{progressText}</span>}
          {!art && <GlParentProvider value={visualValue}>{visual}</GlParentProvider>}
        </button>
      );
    }

    return (
      <button
        {...props}
        ref={nav.ref}
        type={type}
        className={styles.tile}
        data-focused={nav.focused || undefined}
        data-ratio={ratio}
        data-label={labelPlacement}
        data-progress={hasProgress || undefined}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        onMouseMove={event => {
          nav.onPointerFocus();
          onPointerFocus?.();
          onMouseMove?.(event);
        }}
      >
        <span className={styles.frame}>
          <span className={styles.visual}>
            {visual}
            {labelPlacement === 'overlay' && (
              <span className={styles.scrimLayer} aria-hidden="true" />
            )}
          </span>
          {badge && (
            <span id={`${id}-badge`} className={styles.badge}>
              {badge}
            </span>
          )}
          {hasProgress && (
            <span className={styles.progress}>
              <ProgressBar decorative value={progress} />
            </span>
          )}
          {labelPlacement === 'overlay' && (
            <TileText
              id={id}
              label={label}
              labelHidden={labelHidden}
              supportingText={supportingText}
            />
          )}
        </span>
        {labelPlacement === 'below' && (
          <TileText
            id={id}
            label={label}
            labelHidden={labelHidden}
            supportingText={supportingText}
          />
        )}
        {progressText && (
          <span id={`${id}-progress`} className={visuallyHidden}>
            {progressText}
          </span>
        )}
      </button>
    );
  }
);

function TileText({
  id,
  label,
  labelHidden,
  supportingText,
}: {
  id: string;
  label: string;
  labelHidden: boolean;
  supportingText?: string;
}): ReactNode {
  return (
    <span className={styles.text}>
      <span id={`${id}-label`} className={labelHidden ? visuallyHidden : styles.label}>
        {label}
      </span>
      {supportingText && (
        <span id={`${id}-supporting`} className={styles.supporting}>
          {supportingText}
        </span>
      )}
    </span>
  );
}
