import { UnsupportedFeature } from './errors';
import { toRegExp } from './regex';

/** Evaluator for the Go-template subset Cardigann definitions use. */
type Value = unknown;
type Expr =
  | { type: 'literal'; value: Value }
  | { type: 'path'; path: string[] }
  | { type: 'call'; name: string; args: Expr[] };
type Node =
  | { type: 'text'; text: string }
  | { type: 'print'; expr: Expr }
  | { type: 'if'; branches: { cond: Expr | null; body: Node[] }[] }
  | { type: 'range'; list: Expr; body: Node[]; otherwise: Node[] };

const FUNCTIONS = new Set(['or', 'and', 'eq', 'ne', 'not', 're_replace', 'join']);

export const truthy = (value: Value): boolean =>
  Array.isArray(value)
    ? value.length > 0
    : value !== null && value !== undefined && value !== '' && value !== 0 && value !== false;
const text = (value: Value): string =>
  value === null || value === undefined
    ? ''
    : Array.isArray(value)
      ? value.join(' ')
      : String(value);

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) i++;
    else if (c === '(' || c === ')') tokens.push(source[i++]);
    else if (c === '"' || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === '\\' && c === '"' ? 2 : 1;
      if (j >= source.length) throw new UnsupportedFeature('unterminated string in template');
      tokens.push(source.slice(i, j + 1));
      i = j + 1;
    } else {
      let j = i;
      while (j < source.length && !/[\s()]/.test(source[j])) j++;
      tokens.push(source.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

function parseExpr(tokens: string[]): Expr {
  let pos = 0;
  const operand = (): Expr => {
    const token = tokens[pos++];
    if (token === undefined) throw new UnsupportedFeature('incomplete template expression');
    if (token === '(') {
      const inner = command();
      if (tokens[pos++] !== ')') throw new UnsupportedFeature('unbalanced parentheses');
      return inner;
    }
    if (token[0] === '"')
      return {
        type: 'literal',
        value: JSON.parse(token.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')) as string,
      };
    if (token[0] === '`') return { type: 'literal', value: token.slice(1, -1) };
    if (/^-?\d+(\.\d+)?$/.test(token)) return { type: 'literal', value: Number(token) };
    if (token === 'true' || token === 'false') return { type: 'literal', value: token === 'true' };
    if (token === 'nil') return { type: 'literal', value: null };
    if (token === '.') return { type: 'path', path: [] };
    if (token[0] === '.') return { type: 'path', path: token.slice(1).split('.') };
    if (token[0] === '$') throw new UnsupportedFeature('template variables');
    if (!FUNCTIONS.has(token)) throw new UnsupportedFeature(`template function ${token}`);
    return { type: 'call', name: token, args: [] };
  };
  const command = (): Expr => {
    const head = operand();
    if (head.type !== 'call') return head;
    while (pos < tokens.length && tokens[pos] !== ')') head.args.push(operand());
    return head;
  };
  const expr = command();
  if (pos < tokens.length) throw new UnsupportedFeature('trailing template tokens');
  return expr;
}

export function parseTemplate(source: string): Node[] {
  const parts: ({ action: string } | { text: string })[] = [];
  const pattern = /\{\{(-?)([\s\S]*?)(-?)\}\}/g;
  let last = 0;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    let before = source.slice(last, match.index);
    if (match[1] === '-' && /^\s/.test(match[2])) before = before.replace(/\s+$/, '');
    if (before) parts.push({ text: before });
    parts.push({ action: match[2].trim().replace(/\s+-$/, '') });
    last = match.index + match[0].length;
    if (match[3] === '-' || /\s-$/.test(match[2])) {
      const rest = source.slice(last);
      last += rest.length - rest.replace(/^\s+/, '').length;
    }
    pattern.lastIndex = last;
  }
  if (last < source.length) parts.push({ text: source.slice(last) });

  let index = 0;
  const block = (terminators: string[]): { nodes: Node[]; end: string } => {
    const nodes: Node[] = [];
    while (index < parts.length) {
      const part = parts[index++];
      if ('text' in part) {
        nodes.push({ type: 'text', text: part.text });
        continue;
      }
      const [keyword, ...rest] = part.action.split(/\s+/);
      const body = part.action.slice(keyword.length).trim();
      if (terminators.some(t => part.action === t || part.action.startsWith(t + ' ')))
        return { nodes, end: part.action };
      if (keyword === 'if') {
        const branches: { cond: Expr | null; body: Node[] }[] = [];
        let cond: Expr | null = parseExpr(tokenize(body));
        for (;;) {
          const inner = block(['else', 'end']);
          branches.push({ cond, body: inner.nodes });
          if (inner.end === 'end') break;
          const elseRest = inner.end.slice(4).trim();
          cond = elseRest.startsWith('if ') ? parseExpr(tokenize(elseRest.slice(3))) : null;
        }
        nodes.push({ type: 'if', branches });
      } else if (keyword === 'range') {
        if (rest[0]?.startsWith('$')) throw new UnsupportedFeature('range variables');
        const inner = block(['else', 'end']);
        const otherwise = inner.end === 'else' ? block(['end']).nodes : [];
        nodes.push({
          type: 'range',
          list: parseExpr(tokenize(body)),
          body: inner.nodes,
          otherwise,
        });
      } else if (['else', 'end'].includes(keyword)) {
        throw new UnsupportedFeature('unbalanced template block');
      } else if (['with', 'define', 'template', 'block'].includes(keyword)) {
        throw new UnsupportedFeature(`template action ${keyword}`);
      } else if (!part.action.startsWith('/*')) {
        nodes.push({ type: 'print', expr: parseExpr(tokenize(part.action)) });
      }
    }
    if (terminators.length) throw new UnsupportedFeature('unterminated template block');
    return { nodes, end: '' };
  };
  return block([]).nodes;
}

const lookup = (root: Value, dot: Value, path: string[]): Value => {
  if (path.length === 0) return dot;
  const walk = (start: Value): Value => {
    let value = start;
    for (const key of path) {
      if (value === null || typeof value !== 'object') return undefined;
      value = (value as Record<string, Value>)[key];
    }
    return value;
  };
  const local =
    dot !== null && typeof dot === 'object' && !Array.isArray(dot) ? walk(dot) : undefined;
  return local !== undefined ? local : walk(root);
};

function evaluate(expr: Expr, root: Value, dot: Value): Value {
  if (expr.type === 'literal') return expr.value;
  if (expr.type === 'path') return lookup(root, dot, expr.path);
  const args = expr.args.map(arg => evaluate(arg, root, dot));
  switch (expr.name) {
    case 'or':
      return args.find(truthy) ?? args.at(-1);
    case 'and':
      return args.find(a => !truthy(a)) ?? args.at(-1);
    case 'not':
      return !truthy(args[0]);
    case 'eq':
      return args.slice(1).some(a => text(a) === text(args[0]) || a === args[0]);
    case 'ne':
      return !args.slice(1).some(a => text(a) === text(args[0]) || a === args[0]);
    case 're_replace': {
      const [subject, pattern, replacement] = args;
      return text(subject).replace(
        toRegExp(text(pattern), 'g'),
        text(replacement).replace(/\$\{(\d+)\}/g, '$$$1')
      );
    }
    case 'join':
      return (Array.isArray(args[0]) ? args[0] : [args[0]]).map(text).join(text(args[1]));
    default:
      throw new UnsupportedFeature(`template function ${expr.name}`);
  }
}

function render(nodes: Node[], root: Value, dot: Value): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') out += node.text;
    else if (node.type === 'print') out += text(evaluate(node.expr, root, dot));
    else if (node.type === 'if') {
      for (const branch of node.branches)
        if (branch.cond === null || truthy(evaluate(branch.cond, root, dot))) {
          out += render(branch.body, root, dot);
          break;
        }
    } else {
      const list = evaluate(node.list, root, dot);
      const items = Array.isArray(list) ? list : [];
      if (items.length) for (const item of items) out += render(node.body, root, item);
      else out += render(node.otherwise, root, dot);
    }
  }
  return out;
}

const cache = new Map<string, Node[]>();
export function parseCached(source: string): Node[] {
  let nodes = cache.get(source);
  if (!nodes) {
    nodes = parseTemplate(source);
    if (cache.size > 2000) cache.clear();
    cache.set(source, nodes);
  }
  return nodes;
}

/** Renders a template string; strings without `{{` are returned untouched. */
export function renderTemplate(source: string, context: Record<string, unknown>): string {
  if (!source.includes('{{')) return source;
  return render(parseCached(source), context, context);
}
/** Throws UnsupportedFeature when the template cannot be evaluated. */
export function validateTemplate(source: string): void {
  if (source.includes('{{')) parseCached(source);
}
