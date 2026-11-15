import type { CSSProperties, ReactNode } from 'react';

import { useSurfaceContext } from '../surface';
import type { Radius, TypeRole } from '../tokens';
import * as styles from './skeleton.css';

type SkeletonShape =
  | {
      /** Lines of text in a type role, each one line height tall; the last of several is shorter. */
      shape: 'text';
      type?: TypeRole;
      lines?: number;
      /** The text block's width, e.g. `12rem` for a title. Fills its container by default. */
      width?: string;
      ratio?: undefined;
      height?: undefined;
      radius?: undefined;
      size?: undefined;
    }
  | {
      /**
       * Artwork, a tile frame, a panel. `ratio` takes Artwork's ratios (`fill` covers a positioned
       * container); without one, give a `height`.
       */
      shape: 'box';
      ratio?: 'landscape' | 'portrait' | 'square' | 'fill';
      width?: string;
      height?: string;
      radius?: Radius;
      type?: undefined;
      lines?: undefined;
      size?: undefined;
    }
  | {
      /** An Avatar's place, at Avatar's sizes. */
      shape: 'circle';
      size: 'sm' | 'md' | 'lg' | 'xl' | 'fill';
      type?: undefined;
      lines?: undefined;
      width?: undefined;
      ratio?: undefined;
      height?: undefined;
      radius?: undefined;
    };

export type SkeletonProps = SkeletonShape;

/**
 * Placeholder geometry for loading content: exactly the box of what replaces it, so the layout
 * never moves when it arrives. Always hidden from assistive technology: the loading region says
 * it is loading once (`aria-busy` and a labelled ProgressSpinner or status), never per placeholder.
 * It pulses with opacity, and stays still with reduced motion.
 */
export function Skeleton({
  shape,
  type = 'body',
  lines = 1,
  width,
  ratio,
  height,
  radius,
  size,
}: SkeletonProps) {
  const surface = useSurfaceContext();
  if (shape === 'text') {
    return (
      <span
        className={styles.textBlock}
        data-type={type}
        data-surface={surface}
        style={width ? { width } : undefined}
        aria-hidden="true"
      >
        {Array.from({ length: Math.max(1, lines) }, (_, index) => (
          <span key={index} className={styles.line} />
        ))}
      </span>
    );
  }
  const boxStyle: CSSProperties | undefined =
    shape === 'box' && (width || (height && !ratio))
      ? { width, height: ratio ? undefined : height }
      : undefined;
  return (
    <span
      className={styles.shape}
      data-shape={shape}
      data-surface={surface}
      data-ratio={ratio}
      data-size={size}
      data-radius={radius}
      style={boxStyle}
      aria-hidden="true"
    />
  );
}

export interface SkeletonGroupProps {
  /** The placeholders, laid out as the loaded content will be. */
  children: ReactNode;
}

/**
 * Pulses its placeholders together, as one layer: use it around a loading card or row instead of
 * letting each placeholder animate on its own. A block: the feature lays out its content.
 */
export function SkeletonGroup({ children }: SkeletonGroupProps) {
  return (
    <div className={styles.group} aria-hidden="true">
      {children}
    </div>
  );
}
