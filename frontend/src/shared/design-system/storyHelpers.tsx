import type { CSSProperties, ReactNode } from 'react';

import { SurfaceContextProvider, type SurfaceContextValue } from './surface';
import { color, fontFamily, space, typeScale } from './tokens';

/** Stand-in artwork for over-media examples: bright and dark areas, no network image. */
const artwork =
  'linear-gradient(115deg, #f4d58d 0%, #e07a5f 30%, #3d405b 65%, #0b132b 100%), #3d405b';

/** A story-only stage: canvas, or artwork for `overMedia`, providing the surface context. */
export function SurfaceStage({
  surface,
  children,
}: {
  surface: SurfaceContextValue;
  children: ReactNode;
}) {
  const stageStyle: CSSProperties = {
    padding: space.lg,
    borderRadius: '0.5rem',
    background: surface === 'overMedia' ? artwork : color.canvas,
  };
  return (
    <SurfaceContextProvider value={surface}>
      <div style={stageStyle}>{children}</div>
    </SurfaceContextProvider>
  );
}

const captionStyle: CSSProperties = {
  margin: `0 0 ${space.xs}`,
  fontFamily,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
  color: color.textSecondary,
};

/** A labelled cell of a state matrix. */
export function StateCell({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'inline-block',
        verticalAlign: 'top',
        margin: `0 ${space.lg} ${space.md} 0`,
      }}
    >
      <p style={captionStyle}>{name}</p>
      {children}
    </div>
  );
}
