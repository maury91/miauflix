import { UnsupportedFeature } from './errors';
import { toRegExp } from './regex';

export interface FilterSpec {
  name: string;
  args?: unknown;
}
export interface FilterContext {
  now: () => number;
  /** Search keywords, for `andmatch`. */
  keywords: string;
}

export const KNOWN_FILTERS = new Set([
  'replace',
  're_replace',
  'regexp',
  'split',
  'trim',
  'append',
  'prepend',
  'tolower',
  'toupper',
  'urlencode',
  'urldecode',
  'htmldecode',
  'htmlencode',
  'querystring',
  'diacritics',
  'validfilename',
  'strdump',
  'dateparse',
  'timeago',
  'fuzzytime',
  'validate',
  'andmatch',
]);

const argList = (args: unknown): string[] =>
  args === undefined || args === null
    ? []
    : (Array.isArray(args) ? args : [args]).map(arg => String(arg));

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
const htmlDecode = (value: string) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : +entity.slice(1);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[entity.toLowerCase()] ?? whole;
  });

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const ZONES: Record<string, number> = {
  UTC: 0,
  GMT: 0,
  EST: -300,
  EDT: -240,
  CST: -360,
  CDT: -300,
  MST: -420,
  MDT: -360,
  PST: -480,
  PDT: -420,
  CET: 60,
  CEST: 120,
};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Parses a date with a Go reference layout (the subset Cardigann definitions use). */
export function parseGoDate(value: string, layout: string): Date | null {
  const tokens: [string, string, string?][] = [
    ['January', '([A-Za-z]+)', 'month-name'],
    ['Monday', '[A-Za-z]+'],
    ['2006', '(\\d{4})', 'year'],
    ['-07:00', '([+-]\\d{2}:\\d{2})', 'offset'],
    ['-0700', '([+-]\\d{4})', 'offset'],
    ['Z07:00', '(Z|[+-]\\d{2}:\\d{2})', 'offset'],
    ['Jan', '([A-Za-z]{3})', 'month-name'],
    ['Mon', '[A-Za-z]{3}'],
    ['MST', '([A-Z]{2,5})', 'zone'],
    ['_2', '\\s?(\\d{1,2})', 'day'],
    ['01', '(\\d{2})', 'month'],
    ['02', '(\\d{2})', 'day'],
    ['03', '(\\d{2})', 'hour12'],
    ['04', '(\\d{2})', 'minute'],
    ['05', '(\\d{2})', 'second'],
    ['06', '(\\d{2})', 'year2'],
    ['15', '(\\d{2})', 'hour'],
    ['PM', '([AaPp][Mm])', 'ampm'],
    ['pm', '([AaPp][Mm])', 'ampm'],
    ['.000', '\\.(\\d{3})', 'ms'],
    ['1', '(\\d{1,2})', 'month'],
    ['2', '(\\d{1,2})', 'day'],
    ['3', '(\\d{1,2})', 'hour12'],
    ['4', '(\\d{1,2})', 'minute'],
    ['5', '(\\d{1,2})', 'second'],
  ];
  let pattern = '';
  const fields: string[] = [];
  for (let i = 0; i < layout.length; ) {
    const token = tokens.find(([literal]) => layout.startsWith(literal, i));
    if (token) {
      pattern += token[1];
      if (token[2]) fields.push(token[2]);
      i += token[0].length;
    } else pattern += escape(layout[i++]);
  }
  const match = new RegExp(`^\\s*${pattern}\\s*$`).exec(value);
  if (!match) return null;
  const date = {
    year: 1970,
    month: 1,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
    ms: 0,
    pm: null as boolean | null,
  };
  let offset = 0;
  fields.forEach((field, index) => {
    const raw = match[index + 1];
    switch (field) {
      case 'year':
        date.year = +raw;
        break;
      case 'year2':
        date.year = 2000 + +raw;
        break;
      case 'month':
        date.month = +raw;
        break;
      case 'month-name': {
        const found = MONTHS.findIndex(m => m.startsWith(raw.toLowerCase().slice(0, 3)));
        date.month = found + 1;
        break;
      }
      case 'day':
        date.day = +raw;
        break;
      case 'hour':
      case 'hour12':
        date.hour = +raw;
        break;
      case 'minute':
        date.minute = +raw;
        break;
      case 'second':
        date.second = +raw;
        break;
      case 'ms':
        date.ms = +raw;
        break;
      case 'ampm':
        date.pm = raw.toLowerCase() === 'pm';
        break;
      case 'offset':
        offset =
          raw === 'Z'
            ? 0
            : (raw[0] === '-' ? -1 : 1) *
              (+raw.slice(1, 3) * 60 +
                +raw.slice(raw.length === 6 ? 4 : 3, raw.length === 6 ? 6 : 5));
        break;
      case 'zone':
        offset = ZONES[raw] ?? 0;
        break;
    }
  });
  if (date.pm !== null) date.hour = (date.hour % 12) + (date.pm ? 12 : 0);
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) return null;
  const result = new Date(
    Date.UTC(date.year, date.month - 1, date.day, date.hour, date.minute, date.second, date.ms) -
      offset * 60_000
  );
  return Number.isFinite(result.getTime()) ? result : null;
}

const UNIT_MS: Record<string, number> = {
  second: 1000,
  sec: 1000,
  minute: 60_000,
  min: 60_000,
  hour: 3600_000,
  day: 86400_000,
  week: 7 * 86400_000,
  month: 30 * 86400_000,
  year: 365 * 86400_000,
};
export function parseTimeAgo(value: string, now: number): Date | null {
  const text = value.trim().toLowerCase();
  if (/^(just now|now)$/.test(text)) return new Date(now);
  let total = 0;
  let found = false;
  for (const match of text.matchAll(/(\d+(?:\.\d+)?|an?)\s*([a-z]+?)s?\b/g)) {
    const unit = UNIT_MS[match[2]];
    if (!unit) continue;
    total += (/^an?$/.test(match[1]) ? 1 : parseFloat(match[1])) * unit;
    found = true;
  }
  return found && /ago/.test(text) ? new Date(now - total) : null;
}
function parseFuzzy(value: string, now: number): Date | null {
  const text = value.trim();
  const relative = /^(today|yesterday|tomorrow)\b[\s,]*(\d{1,2}):(\d{2})?/i.exec(text);
  if (relative) {
    const base = new Date(now);
    const shift = { today: 0, yesterday: -1, tomorrow: 1 }[relative[1].toLowerCase() as 'today'];
    return new Date(
      Date.UTC(
        base.getUTCFullYear(),
        base.getUTCMonth(),
        base.getUTCDate() + shift,
        +relative[2],
        +(relative[3] ?? 0)
      )
    );
  }
  return parseTimeAgo(text, now) ?? parseAnyDate(text);
}
export function parseAnyDate(value: string): Date | null {
  const text = value.trim();
  // Unix timestamps, in seconds or milliseconds, are what most JSON APIs return.
  if (/^\d{9,13}$/.test(text)) {
    const number = Number(text);
    return new Date(text.length <= 10 ? number * 1000 : number);
  }
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** "1.2 GB", "1,5 GiB", "700 MB" to bytes; null when unparseable. */
export function parseSize(value: string): number | null {
  const match = /([\d.,]+)\s*([kmgtp]?)i?b?/i.exec(value.trim());
  if (!match) return null;
  let number = match[1];
  if (/,\d{1,2}$/.test(number) && !number.includes('.')) number = number.replace(',', '.');
  else number = number.replace(/,/g, '');
  const amount = parseFloat(number);
  if (!Number.isFinite(amount)) return null;
  // A bare number is bytes; indexOf('') would otherwise read it as kilobytes.
  const power = match[2] ? 'kmgtp'.indexOf(match[2].toLowerCase()) + 1 : 0;
  return Math.round(amount * 1024 ** power);
}

export function applyFilter(value: string, filter: FilterSpec, context: FilterContext): string {
  const args = argList(filter.args);
  switch (filter.name) {
    case 'replace':
      return value.split(args[0] ?? '').join(args[1] ?? '');
    case 're_replace':
      return value.replace(
        toRegExp(args[0] ?? '', 'g'),
        (args[1] ?? '').replace(/\$\{(\d+)\}/g, '$$$1')
      );
    case 'regexp': {
      const match = toRegExp(args[0] ?? '', 's').exec(value);
      return match ? (match[1] ?? match[0]) : '';
    }
    case 'split': {
      const parts = value.split(args[0] ?? '');
      const index = Number(args[1] ?? 0);
      return parts[index < 0 ? parts.length + index : index] ?? '';
    }
    case 'trim': {
      if (!args[0]) return value.trim();
      const set = new Set(args[0]);
      let start = 0;
      let end = value.length;
      while (start < end && set.has(value[start])) start++;
      while (end > start && set.has(value[end - 1])) end--;
      return value.slice(start, end);
    }
    case 'append':
      return value + (args[0] ?? '');
    case 'prepend':
      return (args[0] ?? '') + value;
    case 'tolower':
      return value.toLowerCase();
    case 'toupper':
      return value.toUpperCase();
    case 'urlencode':
      return encodeURIComponent(value);
    case 'urldecode':
      try {
        return decodeURIComponent(value.replace(/\+/g, ' '));
      } catch {
        return value;
      }
    case 'htmldecode':
      return htmlDecode(value);
    case 'htmlencode':
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    case 'querystring': {
      const query = value.includes('?') ? value.slice(value.indexOf('?') + 1) : value;
      return new URLSearchParams(query.split('#')[0]).get(args[0] ?? '') ?? '';
    }
    case 'diacritics':
      return value.normalize('NFD').replace(/\p{M}/gu, '');
    case 'validfilename':
      return value.replace(/[\\/:*?"<>|]/g, '');
    case 'strdump':
      return value;
    case 'dateparse': {
      const date = parseGoDate(value, args[0] ?? '');
      return date ? date.toISOString() : '';
    }
    case 'timeago':
      return parseTimeAgo(value, context.now())?.toISOString() ?? '';
    case 'fuzzytime':
      return parseFuzzy(value, context.now())?.toISOString() ?? '';
    case 'validate': {
      const allowed = (args[0] ?? '').split(',').map(item => item.trim().toLowerCase());
      return allowed.includes(value.trim().toLowerCase()) ? value : '';
    }
    case 'andmatch': {
      const words = context.keywords
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
      const haystack = value.toLowerCase();
      return words.every(word => haystack.includes(word)) ? value : '';
    }
    default:
      throw new UnsupportedFeature(`filter ${filter.name}`);
  }
}

export function applyFilters(
  value: string,
  filters: FilterSpec[] | undefined,
  context: FilterContext,
  renderArgs: (arg: string) => string = arg => arg
): string {
  let result = value;
  for (const filter of filters ?? [])
    result = applyFilter(
      result,
      {
        name: filter.name,
        args: Array.isArray(filter.args)
          ? filter.args.map(arg => (typeof arg === 'string' ? renderArgs(arg) : arg))
          : typeof filter.args === 'string'
            ? renderArgs(filter.args)
            : filter.args,
      },
      context
    );
  return result;
}
