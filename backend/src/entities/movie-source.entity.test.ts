import { Source } from '@miauflix/source-metadata-extractor';
import { getMetadataArgsStorage, type ValueTransformer } from 'typeorm';

import { MovieSource } from './movie-source.entity';

describe('MovieSource source type storage', () => {
  it('preserves existing stored values and appends DCP', () => {
    const column = getMetadataArgsStorage().columns.find(
      entry => entry.target === MovieSource && entry.propertyName === 'sourceType'
    );
    const transformer = column!.options.transformer as ValueTransformer;
    const sources = [
      Source.WEB,
      Source.BLURAY,
      Source.HDTV,
      Source.DVD,
      Source.TS,
      Source.CAM,
      Source.DCP,
    ];
    sources.forEach((source, index) => {
      expect(transformer.to(source)).toBe(index);
      expect(transformer.from(index)).toBe(source);
    });
    expect(transformer.from(null)).toBeNull();
  });
});
