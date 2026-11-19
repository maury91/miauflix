import type { ImageStatus } from '../../gl/art';
import { resolveMediaTileVisual } from './mediaTileVisual';

const sources = { title: 'Dune', artwork: 'a.jpg', logo: 'l.png', titledArtwork: 't.jpg' };
const statuses =
  (map: Record<string, ImageStatus>) =>
  (src: string): ImageStatus =>
    map[src] ?? 'ready';

describe('resolveMediaTileVisual', () => {
  it('shows the titled backdrop alone, naming the tile once it is in', () => {
    expect(resolveMediaTileVisual(sources, statuses({}))).toEqual({
      titled: 't.jpg',
      artwork: null,
      logo: null,
      namesTile: true,
    });
    expect(resolveMediaTileVisual(sources, statuses({ 't.jpg': 'loading' })).namesTile).toBe(false);
  });

  it('falls back to the artwork and logo when the titled backdrop fails', () => {
    expect(resolveMediaTileVisual(sources, statuses({ 't.jpg': 'failed' }))).toEqual({
      titled: null,
      artwork: 'a.jpg',
      logo: 'l.png',
      namesTile: true,
    });
  });

  it('counts a loading logo as shown, a failed one as absent', () => {
    const loading = statuses({ 't.jpg': 'failed', 'l.png': 'loading' });
    expect(resolveMediaTileVisual(sources, loading).namesTile).toBe(true);
    const failed = statuses({ 't.jpg': 'failed', 'l.png': 'failed' });
    expect(resolveMediaTileVisual(sources, failed)).toMatchObject({ logo: null, namesTile: false });
  });

  it('uses neither the titled backdrop nor the logo on a portrait tile', () => {
    const asked: string[] = [];
    const visual = resolveMediaTileVisual({ ...sources, ratio: 'portrait' }, src => {
      asked.push(src);
      return 'ready';
    });
    expect(visual).toEqual({ titled: null, artwork: 'a.jpg', logo: null, namesTile: false });
    expect(asked).toEqual([]);
  });

  it('asks only about the images the answer depends on', () => {
    const asked: string[] = [];
    resolveMediaTileVisual(sources, src => {
      asked.push(src);
      return 'loading';
    });
    expect(asked).toEqual(['t.jpg']);
  });
});
