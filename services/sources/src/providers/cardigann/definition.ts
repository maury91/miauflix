import { parse } from 'yaml';
import { z } from 'zod';

import { UnsupportedFeature } from './errors';
import { KNOWN_FILTERS } from './filters';
import { validateSelector as validateSelectorCss } from './selectors';
import { validateTemplate } from './template';

const filter = z.object({ name: z.string(), args: z.unknown().optional() });
const filters = z.array(filter).optional();
const input = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));
const field = z.object({
  selector: z.string().optional(),
  attribute: z.string().optional(),
  text: z.union([z.string(), z.number(), z.boolean()]).optional(),
  filters,
  optional: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  case: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  remove: z.string().optional(),
});
const path = z.object({
  path: z.string().optional(),
  method: z.string().optional(),
  inputs: input.optional(),
  inheritinputs: z.boolean().optional(),
  categories: z.array(z.union([z.string(), z.number()])).optional(),
  response: z
    .object({ type: z.enum(['html', 'json', 'xml']).optional() })
    .passthrough()
    .optional(),
});
const setting = z.object({
  name: z.string(),
  type: z.string(),
  label: z.string().optional(),
  default: z.union([z.string(), z.boolean(), z.number()]).optional(),
  options: z.record(z.string(), z.string()).optional(),
});
export const definitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  name: z.string(),
  description: z.string().optional(),
  language: z.string().optional(),
  type: z.string(),
  links: z.array(z.string().url()).min(1),
  legacylinks: z.array(z.string().url()).optional(),
  requestDelay: z.number().nonnegative().optional(),
  settings: z.array(setting).optional(),
  caps: z.object({
    categories: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    categorymappings: z
      .array(
        z.object({
          id: z.union([z.string(), z.number()]),
          cat: z.string().optional(),
          desc: z.string().optional(),
        })
      )
      .optional(),
    modes: z.record(z.string(), z.array(z.string())),
  }),
  search: z.object({
    path: z.string().optional(),
    paths: z.array(path).optional(),
    method: z.string().optional(),
    inputs: input.optional(),
    headers: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
    keywordsfilters: filters,
    rows: z.object({
      selector: z.string().optional(),
      attribute: z.string().optional(),
      multiple: z.boolean().optional(),
      after: z.number().int().nonnegative().optional(),
      remove: z.string().optional(),
      filters,
      missingAttributeEqualsNoResults: z.boolean().optional(),
      count: z.unknown().optional(),
    }),
    fields: z.record(z.string(), z.union([field, z.string()])),
  }),
  download: z
    .object({
      selectors: z
        .array(z.object({ selector: z.string(), attribute: z.string().optional(), filters }))
        .optional(),
      method: z.string().optional(),
      before: z.unknown().optional(),
      infohash: z.unknown().optional(),
    })
    .optional(),
});
export type CardigannDefinition = z.infer<typeof definitionSchema>;
export type CardigannField = z.infer<typeof field>;

const OUT_OF_SUBSET = [
  'login',
  'ratio',
  'encoding_override',
  'followredirect',
  'cloudflare',
  'captcha',
] as const;

/** Walks every filter, template and selector so unsupported features surface at install time. */
function audit(definition: CardigannDefinition): void {
  // Selectors of a JSON API are paths, not CSS, so only the others are checked as CSS.
  const json = (definition.search.paths ?? []).some(path => path.response?.type === 'json');
  const validateSelector = (selector: string) => {
    if (!json) validateSelectorCss(selector);
  };
  const checkFilters = (list: z.infer<typeof filters>) => {
    for (const item of list ?? []) {
      if (!KNOWN_FILTERS.has(item.name)) throw new UnsupportedFeature(`filter ${item.name}`);
      for (const arg of Array.isArray(item.args) ? item.args : [item.args])
        if (typeof arg === 'string') validateTemplate(arg);
    }
  };
  const checkText = (value: unknown) => {
    if (typeof value === 'string') validateTemplate(value);
  };
  const search = definition.search;
  if ((search as Record<string, unknown>).preprocessingfilters)
    throw new UnsupportedFeature('preprocessingfilters');
  if (!search.path && !search.paths?.length) throw new UnsupportedFeature('search without a path');
  checkFilters(search.keywordsfilters);
  checkFilters(search.rows.filters);
  if (search.rows.selector) validateSelector(search.rows.selector);
  if (search.rows.remove) validateSelector(search.rows.remove);
  checkText(search.path);
  for (const p of search.paths ?? []) {
    checkText(p.path);
    for (const value of Object.values(p.inputs ?? {})) checkText(value);
  }
  for (const value of Object.values(search.inputs ?? {})) checkText(value);
  if (!search.fields.title) throw new UnsupportedFeature('definition without a title field');
  for (const raw of Object.values(search.fields)) {
    const item = typeof raw === 'string' ? { text: raw } : raw;
    checkFilters(item.filters);
    checkText(item.text);
    for (const value of Object.values(item.case ?? {})) checkText(value);
    if (item.selector) validateSelector(item.selector);
    if (item.remove) validateSelector(item.remove);
  }
  const download = definition.download;
  if (download?.before || download?.infohash) throw new UnsupportedFeature('download.before');
  for (const selector of download?.selectors ?? []) {
    validateSelector(selector.selector);
    checkFilters(selector.filters);
  }
}

/** Parses and audits a definition. Throws UnsupportedFeature (or a plain Error when malformed). */
export function parseDefinition(yamlText: string): CardigannDefinition {
  if (yamlText.length > 512 * 1024) throw new Error('Definition is too large');
  let raw: unknown;
  try {
    raw = parse(yamlText, { maxAliasCount: 50 });
  } catch (error) {
    throw new Error(`Definition is not valid YAML: ${error instanceof Error ? error.message : ''}`);
  }
  if (!raw || typeof raw !== 'object') throw new Error('Definition is empty');
  const record = raw as Record<string, unknown>;
  if (record.type !== 'public') throw new UnsupportedFeature(`${record.type} trackers`);
  for (const key of OUT_OF_SUBSET) if (record[key]) throw new UnsupportedFeature(key);
  const parsed = definitionSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Invalid definition: ${issue?.path.join('.')} ${issue?.message}`);
  }
  audit(parsed.data);
  return parsed.data;
}
