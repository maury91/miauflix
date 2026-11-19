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

  it('keeps the label while the titled backdrop loads', () => {
    expect(record({ 't.jpg': 'loading' })).toMatchSnapshot();
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

  it('is keyed by the props it draws', () => {
    expect(tile(props).key).toBe(tile({ ...props }).key);
    expect(tile({ ...props, logo: 'other.png' }).key).not.toBe(tile(props).key);
  });
});
