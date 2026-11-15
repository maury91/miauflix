import { useNavigation } from '@shared/navigation/hooks';
import { FocusScope, NavigationProvider } from '@shared/navigation/NavigationProvider';
import type { GroupLayout } from '@shared/navigation/types';
import { type CSSProperties, type ReactNode, useLayoutEffect } from 'react';

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

/**
 * Story-only: the navigation layer around an example. One root scope, its children arranged by
 * `layout`; the components inside register themselves with their `navId`.
 */
export function NavigationStage({
  layout = 'vertical',
  initialId,
  children,
}: {
  layout?: GroupLayout;
  initialId?: string;
  children: ReactNode;
}) {
  return (
    <NavigationProvider>
      <FocusScope layout={layout} initialId={initialId}>
        {children}
      </FocusScope>
    </NavigationProvider>
  );
}

/**
 * Story-only: focuses a node (at a part) when the example mounts, as a feature would. Put it after
 * the components it targets, so they have registered.
 */
export function InitialFocus({ id, part }: { id: string; part?: string }) {
  const { focus } = useNavigation();
  useLayoutEffect(() => {
    focus(id, { part });
    // Once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
