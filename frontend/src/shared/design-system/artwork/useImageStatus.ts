import { useCallback, useState } from 'react';

export type ImageStatus = 'loading' | 'loaded' | 'failed';

/**
 * Tracks one image source: loading until it decodes, then loaded or failed. A new source starts
 * over. An image already in the cache is complete before React sees its load event, so the ref
 * checks that too.
 */
export function useImageStatus(src: string | null | undefined) {
  const [state, setState] = useState<{ src: typeof src; status: ImageStatus }>({
    src,
    status: 'loading',
  });
  let status: ImageStatus = src ? state.status : 'failed';
  if (state.src !== src) {
    setState({ src, status: 'loading' });
    status = src ? 'loading' : 'failed';
  }

  const settle = useCallback(
    (next: ImageStatus) =>
      setState(current => (current.src === src ? { src, status: next } : current)),
    [src]
  );
  const ref = useCallback(
    (image: HTMLImageElement | null) => {
      if (image?.complete) settle(image.naturalWidth > 0 ? 'loaded' : 'failed');
    },
    [settle]
  );

  return {
    status,
    imageProps: {
      ref,
      onLoad: () => settle('loaded'),
      onError: () => settle('failed'),
    },
  };
}
