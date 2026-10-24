import { Source } from '@miauflix/source-metadata-extractor';
import { getMetadataArgsStorage, type ValueTransformer } from 'typeorm';

import { ContentSource } from './content-source.entity';

describe('ContentSource source type storage', () => {
  it('preserves existing stored values and appends DCP', () => {
    const column = getMetadataArgsStorage().columns.find(
      entry => entry.target === ContentSource && entry.propertyName === 'sourceType'
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
