import { redactLogArgument } from '@miauflix/service-contracts';

/**
 * The backend logger's interface (`logger.info(tag, ...args)`), on the console. Debug output is
 * on when `DEBUG` is set, as in the other services. Every argument is redacted first: info hashes
 * and magnet links never reach the logs (see redactSourceIdentifiers).
 */
const debugEnabled = Boolean(process.env.DEBUG);

const format = (tag: string) => `[${tag}]`;
const redact = (args: unknown[]) => args.map(arg => redactLogArgument(arg));

export const logger = {
  debug: (tag: string, ...args: unknown[]) => {
    if (debugEnabled) console.debug(format(tag), ...redact(args));
  },
  info: (tag: string, ...args: unknown[]) => console.info(format(tag), ...redact(args)),
  warn: (tag: string, ...args: unknown[]) => console.warn(format(tag), ...redact(args)),
  error: (tag: string, ...args: unknown[]) => console.error(format(tag), ...redact(args)),
};
