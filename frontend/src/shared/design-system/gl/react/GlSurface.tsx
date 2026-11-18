import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { GlBackend } from '../core/renderer';
import { GlNode } from '../core/scene';
import { PixiBackend } from '../pixi/backend';
import { GlLayers, GlLayersProvider, GlParentProvider } from './hooks';

export interface GlSurfaceProps {
  /** The canvas box (CSS px); the canvas is positioned by `className`/`style`. */
  width: number;
  height: number;
  className?: string;
  style?: CSSProperties;
  /** Textures are fetched this far beyond the canvas (px). */
  prefetch?: { x: number; y: number };
  /** Debugging: the backend (stats, last error) on `window[exposeAs]`. */
  exposeAs?: string;
  /** Layers (GlLayer, GlScroller) and the components drawn into them. */
  children: ReactNode;
}

/**
 * A WebGL canvas that design-system components draw into. Children render their DOM as usual;
 * those with a GL form draw into the canvas instead (the caller hides the DOM they replace and
 * keeps it for focus). If the backend can't start, children render as DOM.
 */
export function GlSurface({
  width,
  height,
  className,
  style,
  prefetch = { x: 0, y: 0 },
  exposeAs,
  children,
}: GlSurfaceProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const disposal = useRef(0);
  const [root] = useState(() => new GlNode());
  const [layers] = useState(() => new GlLayers());
  // Created in the first render, so children mount in the same commit as the page (Home's
  // initial focus looks for the rows in its first effects). The GPU side starts async.
  const [failed, setFailed] = useState(false);
  const [backend] = useState<GlBackend | null>(() => {
    try {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      const created = new PixiBackend({
        canvas,
        width,
        height,
        dpr: window.devicePixelRatio || 1,
        onError: error => {
          console.error('[gl] surface unavailable', error);
          setFailed(true);
        },
      });
      created.root = root;
      root.owner = created;
      return created;
    } catch (error) {
      console.error('[gl] surface unavailable', error);
      return null;
    }
  });

  useLayoutEffect(() => {
    if (!backend) return;
    hostRef.current?.appendChild(backend.canvas);
    backend.start();
    const canvasStyle = backend.canvas.style;
    canvasStyle.width = '100%';
    canvasStyle.height = '100%';
    canvasStyle.display = 'block';
    // Deferred: StrictMode runs this cleanup and the effect again on the same backend
    window.clearTimeout(disposal.current);
    return () => {
      disposal.current = window.setTimeout(() => {
        root.owner = null;
        backend.dispose();
      });
    };
  }, [backend, root]);

  useEffect(() => {
    if (!backend || !exposeAs) return;
    const global = window as unknown as Record<string, unknown>;
    global[exposeAs] = backend;
    return () => {
      if (global[exposeAs] === backend) delete global[exposeAs];
    };
  }, [backend, exposeAs]);

  useLayoutEffect(() => {
    if (!backend || failed) return;
    backend.resize(width, height, window.devicePixelRatio || 1);
    backend.prefetch = prefetch;
    root.set({ width, height });
    backend.invalidate();
  });

  useEffect(() => {
    if (!backend || failed) return;
    document.documentElement.setAttribute('data-gl-surface', '');
    return () => document.documentElement.removeAttribute('data-gl-surface');
  }, [backend, failed]);

  // Nothing is drawn until the backend exists: children mount once it does
  const value = useMemo(
    () => (backend && !failed ? { renderer: backend, node: root, width, height, radius: 0 } : null),
    [backend, failed, height, root, width]
  );

  return (
    <>
      <div
        ref={hostRef}
        className={className}
        style={{ ...style, width, height, pointerEvents: 'none' }}
        aria-hidden="true"
      />
      {/* Children draw into the backend, or render as DOM if it can't be created */}
      {value ? (
        <GlLayersProvider value={layers}>
          <GlParentProvider value={value}>{children}</GlParentProvider>
        </GlLayersProvider>
      ) : (
        children
      )}
    </>
  );
}
