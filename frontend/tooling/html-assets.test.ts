import { describe, expect, it } from 'vitest';

import { extractHtmlAssets } from './html-assets';

describe('extractHtmlAssets', () => {
  it.each(['</script>', '</script >', '</SCRIPT>', '</script foo="bar">'])(
    'extracts assets after browser-accepted closing tag %s',
    (closing: string) => {
      expect(extractHtmlAssets(`<script src='/app.js'>${closing}<link href='/app.css'>`)).toEqual({
        jsFiles: ['/app.js'],
        cssFiles: ['/app.css'],
      });
    }
  );

  it('handles quotes, entities, uppercase tags and multiline attributes', () => {
    expect(
      extractHtmlAssets(`<SCRIPT data-note=">"\n SRC='/app.js?a=1&amp;b=2'></SCRIPT>
      <LINK HREF=/app.css><script>const example = '<link href="/fake.css">';</script>`)
    ).toEqual({
      jsFiles: ['/app.js?a=1&b=2'],
      cssFiles: ['/app.css'],
    });
  });

  it('ignores comments, templates, inline scripts and empty or non-CSS links', () => {
    expect(
      extractHtmlAssets(`<!-- <script src="/fake.js"></script> -->
      <template><script src="/inert.js"></script><link href="/inert.css"></template>
      <script src=""></script><link href="/icon.svg"><script>throw new Error('never run');</script>`)
    ).toEqual({ jsFiles: [], cssFiles: [] });
  });
});
