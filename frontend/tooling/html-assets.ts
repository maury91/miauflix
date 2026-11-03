import { type DefaultTreeAdapterMap, parse } from 'parse5';

/** Read build assets using the browser's HTML parsing rules; never execute scripts. */
export function extractHtmlAssets(html: string): { jsFiles: string[]; cssFiles: string[] } {
  const jsFiles: string[] = [];
  const cssFiles: string[] = [];
  const visit = (node: DefaultTreeAdapterMap['node']): void => {
    if ('tagName' in node) {
      const attribute = (name: string) => node.attrs.find(attr => attr.name === name)?.value;
      const src = attribute('src');
      const href = attribute('href');
      if (node.tagName === 'script' && src) jsFiles.push(src);
      if (node.tagName === 'link' && href && href.endsWith('.css')) cssFiles.push(href);
    }
    // Template contents are inert and aren't assets of the active page.
    if ('childNodes' in node) node.childNodes.forEach(visit);
  };
  visit(parse(html));
  return { jsFiles, cssFiles };
}
