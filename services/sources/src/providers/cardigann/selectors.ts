import * as cheerio from 'cheerio';

import { UnsupportedFeature } from './errors';

type CheerioRoot = ReturnType<typeof cheerio.load>;
type CheerioNode = ReturnType<CheerioRoot> extends infer R ? R : never;

export type ResponseType = 'html' | 'json' | 'xml';
/** A row the field selectors read from. */
export interface Row {
  read(selector: string | undefined, attribute: string | undefined): string | null;
  /** Remove matching descendants before text is read (HTML/XML only). */
  strip(selector: string): void;
  /** Does the row itself match, or contain a match for, the selector? (for `case`). */
  matches(selector: string): boolean;
}
export interface RowsSpec {
  selector?: string;
  attribute?: string;
  multiple?: boolean;
  after?: number;
  remove?: string;
  missingAttributeEqualsNoResults?: boolean;
}

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/* JSON ------------------------------------------------------------------------------------ */
type Json = unknown;
const segments = (path: string): string[] =>
  path
    // JSONPath roots (`$.data.items`) mean the document itself.
    .replace(/^\$\.?/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(part => part !== '');
function jsonGet(start: Json, path: string): Json {
  let value = start;
  for (const key of segments(path)) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, Json>)[key];
  }
  return value;
}
class JsonRow implements Row {
  constructor(
    readonly data: Json,
    readonly parent: JsonRow | null
  ) {}
  read(selector: string | undefined): string | null {
    if (!selector || selector === '$' || selector === '.') return asText(this.data);
    let path = selector;
    let levels = 0;
    while (path.startsWith('..')) {
      levels++;
      path = path.slice(2);
    }
    const row = this.ancestor(levels);
    return row ? asText(jsonGet(row.data, path)) : null;
  }
  private ancestor(levels: number): JsonRow | null {
    return levels === 0 ? this : (this.parent?.ancestor(levels - 1) ?? null);
  }
  strip(): void {
    /* JSON has nothing to strip. */
  }
  matches(selector: string): boolean {
    return truthyJson(this.read(selector));
  }
}
const truthyJson = (value: string | null) =>
  value !== null && value !== '' && value !== 'false' && value !== '0' && value !== 'null';

function jsonRows(body: string, spec: RowsSpec): Row[] {
  let root: Json;
  try {
    root = JSON.parse(body);
  } catch {
    throw new Error('Provider returned invalid JSON');
  }
  const base = spec.selector && spec.selector !== '$' ? jsonGet(root, spec.selector) : root;
  const list = Array.isArray(base)
    ? base
    : base && typeof base === 'object'
      ? Object.values(base)
      : [];
  const rows: JsonRow[] = [];
  for (const item of list) {
    const parent = new JsonRow(item, null);
    if (spec.attribute) {
      const nested = jsonGet(item, spec.attribute);
      if (Array.isArray(nested)) for (const child of nested) rows.push(new JsonRow(child, parent));
      else if (nested && typeof nested === 'object' && spec.multiple)
        for (const child of Object.values(nested)) rows.push(new JsonRow(child, parent));
      else if (nested !== undefined && nested !== null && !spec.multiple)
        rows.push(new JsonRow(nested, parent));
    } else rows.push(parent);
  }
  return rows;
}

/* HTML / XML ------------------------------------------------------------------------------ */
/** XML namespaces are written `torznab|attr` in definitions; CSS escapes the colon instead. */
const namespaced = (selector: string, xml: boolean) =>
  xml ? selector.replace(/([A-Za-z][\w-]*)\|(?=[A-Za-z*])/g, '$1\\:') : selector;

class DomRow implements Row {
  constructor(
    private readonly $: CheerioRoot,
    readonly element: CheerioNode,
    private readonly xml: boolean
  ) {}
  private find(selector: string): CheerioNode {
    if (selector === ':root' || selector === '.') return this.element;
    try {
      return this.element.find(namespaced(selector, this.xml)).first() as unknown as CheerioNode;
    } catch {
      throw new UnsupportedFeature(`selector ${selector}`);
    }
  }
  read(selector: string | undefined, attribute: string | undefined): string | null {
    const target = selector ? this.find(selector) : this.element;
    if (target.length === 0) return null;
    if (attribute) return target.attr(attribute) ?? null;
    return target.text().replace(/\s+/g, ' ').trim();
  }
  strip(selector: string): void {
    try {
      this.element.find(namespaced(selector, this.xml)).remove();
    } catch {
      throw new UnsupportedFeature(`selector ${selector}`);
    }
  }
  matches(selector: string): boolean {
    try {
      const css = namespaced(selector, this.xml);
      return this.element.is(css) || this.element.find(css).length > 0;
    } catch {
      throw new UnsupportedFeature(`selector ${selector}`);
    }
  }
}
function domRows(body: string, spec: RowsSpec, xml: boolean): Row[] {
  const $ = cheerio.load(body, xml ? { xmlMode: true } : {});
  if (!spec.selector) return [];
  let elements;
  try {
    elements = $(namespaced(spec.selector, xml)).toArray();
  } catch {
    throw new UnsupportedFeature(`selector ${spec.selector}`);
  }
  return elements.map(element => new DomRow($, $(element) as unknown as CheerioNode, xml));
}

export function selectRows(type: ResponseType, body: string, spec: RowsSpec): Row[] {
  const rows = type === 'json' ? jsonRows(body, spec) : domRows(body, spec, type === 'xml');
  return rows.slice(Math.max(0, spec.after ?? 0));
}

/** Test seam: parse a selector eagerly so unsupported syntax is found at install time. */
export function validateSelector(selector: string): void {
  if (selector.includes('{{')) return;
  try {
    cheerio.load('<div></div>')(namespaced(selector, true));
  } catch {
    throw new UnsupportedFeature(`selector ${selector}`);
  }
}
