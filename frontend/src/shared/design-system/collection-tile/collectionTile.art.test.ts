import { RecordingPainter } from '../gl/testing';
import { collectionTileArt, paintFocusRing } from './collectionTile.art';

describe('CollectionTile picture', () => {
  it('draws the label and supporting text below the frame', () => {
    const art = collectionTileArt({ label: 'Kids', supportingText: 'Profile', width: 200 });
    expect({
      size: [art.width, art.height],
      calls: RecordingPainter.record(art),
    }).toMatchSnapshot();
  });

  it('draws the scrim, progress and text over a portrait frame', () => {
    const art = collectionTileArt({
      label: 'Dune',
      supportingText: '2021',
      ratio: 'portrait',
      labelPlacement: 'overlay',
      progress: 0.25,
      width: 200,
    });
    expect(RecordingPainter.record(art)).toMatchSnapshot();
  });

  it('keeps the name for the reader only when labelHidden', () => {
    const calls = RecordingPainter.record(
      collectionTileArt({ label: 'Dune', labelHidden: true, labelPlacement: 'overlay', width: 200 })
    );
    expect(calls.some(call => call.op === 'text')).toBe(false);
  });

  it('changes key exactly when a prop changes', () => {
    const base = { label: 'Dune', width: 200 };
    expect(collectionTileArt(base).key).toBe(collectionTileArt({ ...base }).key);
    expect(collectionTileArt({ ...base, progress: 0.5 }).key).not.toBe(collectionTileArt(base).key);
    expect(collectionTileArt({ ...base, width: 201 }).key).not.toBe(collectionTileArt(base).key);
  });

  it('draws the focus outline around the frame', () => {
    const painter = new RecordingPainter();
    paintFocusRing(painter, 200, 112.5);
    expect(painter.calls).toMatchSnapshot();
  });
});
