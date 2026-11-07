/**
 * The backend logger's interface (`logger.info(tag, ...args)`), on the console. Debug output is
 * on when `DEBUG` is set, as in the other services.
 */
const debugEnabled = Boolean(process.env.DEBUG);

const format = (tag: string) => `[${tag}]`;

export const logger = {
  debug: (tag: string, ...args: unknown[]) => {
    if (debugEnabled) console.debug(format(tag), ...args);
  },
  info: (tag: string, ...args: unknown[]) => console.info(format(tag), ...args),
  warn: (tag: string, ...args: unknown[]) => console.warn(format(tag), ...args),
  error: (tag: string, ...args: unknown[]) => console.error(format(tag), ...args),
};
