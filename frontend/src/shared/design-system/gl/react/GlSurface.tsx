import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  Suspense,
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { hitTest } from '../core/hitTest';
import { followReducedMotion } from '../core/motion';
import type { GlBackend, GlBackendOptions, GlTuning } from '../core/renderer';
import { GlNode } from '../core/scene';
import { loadedGlBackend, preloadGlBackend } from './backendModule';
import { reportGlFailure } from './glSupport';
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
  /** Read once, when the surface starts. */
  tuning?: GlTuning;
  /** Layers (GlLayer, GlScroller) and the components drawn into them. */
  children: ReactNode;
}

type BackendClass = new (options: GlBackendOptions) => GlBackend;

/**
 * A WebGL canvas that design-system components draw into. Children render their DOM as usual;
 * those with a GL form draw into the canvas instead (the caller hides the DOM they replace and
 * keeps it for focus). If the backend can't start, or loses its context for good, children render
 * as DOM and `reportGlFailure` tells the page (useGlAvailable).
 *
 * The canvas takes the pointer: a move or click over a node with a `target` (useGlTarget) goes to
 * that element, so the hidden DOM handles it as if it were there. Elsewhere nothing happens.
 * Engine animations follow `prefers-reduced-motion`.
 *
 * The backend is its own chunk (preloadGlBackend). Loaded, the surface and its children mount in
 * the same commit as the page; otherwise nothing shows until it is.
 */
export function GlSurface(props: GlSurfaceProps) {
  const module = loadedGlBackend();
  if (module) return <Surface {...props} Backend={module.PixiBackend} />;
  return (
    <Suspense fallback={null}>
      <LoadingSurface {...props} />
    </Suspense>
  );
}

function LoadingSurface(props: GlSurfaceProps) {
  const { PixiBackend } = use(preloadGlBackend());
  return <Surface {...props} Backend={PixiBackend} />;
}

function Surface({
  Backend,
  width,
  height,
  className,
  style,
  prefetch = { x: 0, y: 0 },
  exposeAs,
  tuning,
  children,
}: GlSurfaceProps & { Backend: BackendClass }) {
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
      const created = new Backend({
        canvas,
        width,
        height,
        dpr: window.devicePixelRatio || 1,
        tuning,
        onError: error => {
          console.error('[gl] surface unavailable', error);
          setFailed(true);
          reportGlFailure();
        },
      });
      return created;
    } catch (error) {
      console.error('[gl] surface unavailable', error);
      return null;
    }
  });

  useEffect(() => followReducedMotion(() => backend?.invalidate()), [backend]);

  // The pointer over a node goes to its target (the hidden DOM isn't where nodes are drawn)
  const forward = (event: MouseEvent<HTMLDivElement>) => {
    if (!backend || failed) return;
    const box = event.currentTarget.getBoundingClientRect();
    const target = hitTest(root, event.clientX - box.left, event.clientY - box.top)?.target;
    event.currentTarget.style.cursor = target ? 'pointer' : '';
    if (!target || (target as HTMLButtonElement).disabled) return;
    const { clientX, clientY, screenX, screenY } = event;
    target.dispatchEvent(
      new window.MouseEvent(event.type, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        screenX,
        screenY,
      })
    );
  };

  useLayoutEffect(() => {
    if (!backend) return;
    // Wired here, not in the initializer: StrictMode runs it twice and keeps one backend
    backend.root = root;
    root.owner = backend;
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
    if (backend && !failed) return;
    if (backend) {
      root.owner = null;
      backend.canvas.remove();
      backend.dispose();
    }
    reportGlFailure();
  }, [backend, failed, root]);

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
        style={{ ...style, width, height, pointerEvents: value ? undefined : 'none' }}
        aria-hidden="true"
        onMouseMove={forward}
        onClick={forward}
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
