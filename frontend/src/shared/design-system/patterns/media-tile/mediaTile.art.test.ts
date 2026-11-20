import { collectionTileArt } from '../../collection-tile/collectionTile.art';
import { type ImageStatus, RecordingPainter } from '../../gl/testing';
import { mediaTileVisual } from './mediaTile.art';

const props = { title: 'Dune', artwork: 'a.jpg', logo: 'l.png', titledArtwork: 't.jpg' };
const tile = (visual: Parameters<typeof mediaTileVisual>[0]) =>
  collectionTileArt(
    { label: visual.title, labelPlacement: 'overlay', progress: 0.4, width: 320 },
    mediaTileVisual(visual)
  );
const record = (statuses: Record<string, ImageStatus>, visual = props) =>
  RecordingPainter.record(tile(visual), { image: src => statuses[src] ?? 'ready' });

describe('MediaTile picture', () => {
  it('draws the titled backdrop and hides the label', () => {
    expect(record({})).toMatchSnapshot();
  });

  it('asks for no label while the titled backdrop loads (it bakes once the image settles)', () => {
    const calls = record({ 't.jpg': 'loading' });
    expect(calls.some(call => call.op === 'text')).toBe(false);
    expect(calls.some(call => call.op === 'image' && call.src === 't.jpg')).toBe(true);
  });

  it('draws the artwork and the logo when the titled backdrop fails', () => {
    expect(record({ 't.jpg': 'failed' })).toMatchSnapshot();
  });

  it('draws the label when the logo fails too', () => {
    expect(record({ 't.jpg': 'failed', 'l.png': 'failed' })).toMatchSnapshot();
  });

  it('draws the title in the frame without artwork', () => {
    expect(record({}, { title: 'Dune' } as typeof props)).toMatchSnapshot();
  });

  it('holds an earlier titled backdrop of the same title only', () => {
    const titled = (title: string, revision: number) =>
      mediaTileVisual({ title, titledArtwork: `/card/${revision}.jpg`, ratio: 'landscape' });
    expect(titled('Dune', 2).holdKey).toBe(titled('Dune', 1).holdKey);
    expect(titled('Dune', 2).key).not.toBe(titled('Dune', 1).key);
    expect(titled('Arrival', 1).holdKey).not.toBe(titled('Dune', 1).holdKey);
    expect(mediaTileVisual({ title: 'Dune', artwork: '/b.jpg' }).holdKey).toBeUndefined();
  });

  it('is keyed by the props it draws', () => {
    expect(tile(props).key).toBe(tile({ ...props }).key);
    expect(tile({ ...props, logo: 'other.png' }).key).not.toBe(tile(props).key);
  });
});
