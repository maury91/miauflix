/**
 * Minimal leveled logger, formatted like the main app's (@logger) so log scrapers
 * keep working: `[MM-DD HH:mm:ss] [scope] message`. Debug logs are only printed when
 * the scope is enabled through the DEBUG environment variable (comma-separated list,
 * trailing `*` wildcard supported) — same convention as the `debug` package used by
 * the backend, without the dependency.
 */

type Severity = 'debug' | 'info' | 'warn' | 'error';

const SEVERITY_COLORS: Record<Severity, string> = {
  debug: '\x1b[34m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

const isEnabled = (scope: string): boolean => {
  const pattern = process.env.DEBUG;
  if (!pattern) return false;
  return pattern
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0 && entry !== '-*')
    .some(entry => (entry.endsWith('*') ? scope.startsWith(entry.slice(0, -1)) : scope === entry));
};

const print = (severity: Severity, scope: string, message: string, ...metadata: unknown[]) => {
  if (severity === 'debug' && !isEnabled(scope)) return;

  const timestamp = new Date().toISOString().replace('T', ' ').slice(5, 22);
  const formatted = `[${timestamp}] [${scope}] ${message}`;
  const formattedMetadata = metadata.map(entry =>
    entry instanceof Error ? entry : ` ${JSON.stringify(entry)}`
  );

  const emit = (console[severity] as (...args: unknown[]) => void).bind(console);
  emit(`${SEVERITY_COLORS[severity]}${formatted}\x1b[0m`, ...formattedMetadata);
};

export const logger = {
  debug: (scope: string, message: string, ...metadata: unknown[]) =>
    print('debug', scope, message, ...metadata),
  info: (scope: string, message: string, ...metadata: unknown[]) =>
    print('info', scope, message, ...metadata),
  warn: (scope: string, message: string, ...metadata: unknown[]) =>
    print('warn', scope, message, ...metadata),
  error: (scope: string, message: string, ...metadata: unknown[]) =>
    print('error', scope, message, ...metadata),
};
