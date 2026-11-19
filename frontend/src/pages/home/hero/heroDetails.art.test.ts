import type { MediaDto } from '@miauflix/backend';
import { RecordingPainter } from '@shared/design-system/gl/testing';

import { heroDetailsArt } from './heroDetails.art';
import { heroDetailsModel } from './heroDetailsModel';

const movie = {
  _type: 'movie',
  mediaId: 1,
  title: 'Dune',
  runtime: 155,
  releaseDate: '2021-10-22',
  rating: 7.8,
  genres: ['Science Fiction'],
  overview: 'Paul Atreides travels to Arrakis.',
} as unknown as MediaDto;

const art = heroDetailsArt(heroDetailsModel(movie), {
  windowHeight: 1080,
  detailsWidth: 720,
  width: 1920,
});

const draw = (logoUrl: string | null) => {
  const painter = new RecordingPainter();
  art.draw(painter, { left: 96, bottom: 497, logoUrl });
  return painter.calls;
};

describe('Hero details picture', () => {
  it('stacks the overview, genres, metadata line and title bottom up', () => {
    expect(draw(null)).toMatchSnapshot();
  });

  it('draws the logo in place of the title', () => {
    const calls = draw('logo.png');
    expect(calls.at(-1)).toMatchObject({ op: 'image', src: 'logo.png' });
    expect(calls.some(call => call.op === 'text' && call.text === 'Dune')).toBe(false);
  });

  it('lists every text it draws, without the title when the logo shows', () => {
    expect(art.texts(false).map(spec => spec.text)).toEqual([
      'Dune',
      '2h 35m',
      '2021',
      '★',
      '7.8',
      'Checking…',
      'Science Fiction',
      'Paul Atreides travels to Arrakis.',
    ]);
    expect(art.texts(true)).toHaveLength(7);
  });
});
