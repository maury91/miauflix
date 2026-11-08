import { API_CREDENTIALS } from '@shared/config/constants';
import { useEffect, useState } from 'react';

let nextFamily = 0;

/**
 * Load the font a release ships for its subtitles (the dialogue style's face) and return a
 * family name to draw captions with. Undefined until it loads, or when there is none.
 */
export function useSubtitleFont(url: string | null): string | undefined {
  const [family, setFamily] = useState<string>();

  useEffect(() => {
    setFamily(undefined);
    if (!url || typeof FontFace === 'undefined' || !document.fonts) return;
    const controller = new AbortController();
    let face: FontFace | undefined;
    fetch(url, { credentials: API_CREDENTIALS, signal: controller.signal })
      .then(async (response: Response) => {
        if (!response.ok) return;
        const name = `miauflix-subtitle-${++nextFamily}`;
        // Every weight maps to this one face, so captions use it as shipped instead of faking bold.
        face = new FontFace(name, await response.arrayBuffer(), { weight: '100 900' });
        await face.load();
        if (controller.signal.aborted) return;
        document.fonts.add(face);
        setFamily(name);
      })
      .catch(() => {
        // Captions keep the app's font.
      });
    return () => {
      controller.abort();
      if (face) document.fonts.delete(face);
    };
  }, [url]);

  return family;
}
