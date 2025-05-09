import process from 'node:process';

type Severity = 'debug' | 'error' | 'info' | 'warn';

// Read and parse the DEBUG environment variable
const debugEnv = process.env.DEBUG || '';
const debugAll = debugEnv === '*';
const debugServices = new Set(debugAll ? [] : debugEnv.split(',').filter(Boolean));

const shouldShowDebug = (service: string): boolean => {
  if (debugAll) {
    return true;
  }
  return debugServices.has(service);
};

const print = (severity: Severity, service: string, message: string, metadata?: unknown) => {
  // Skip debug logs if the service is not enabled
  if (severity === 'debug' && !shouldShowDebug(service)) {
    return;
  }

  const timestamp = new Date().toISOString().replace('T', ' ').slice(5, 22);
  const formattedMessage = `[${timestamp}] [${service}] ${message}`;
  // Only stringify metadata if it exists
  const metadataString =
    typeof metadata === 'undefined' ? '' : ` ${JSON.stringify(metadata, null, 2)}`; // Add space prefix

  switch (severity) {
    case 'debug':
      // Use console.debug and pass metadataString as a separate argument
      console.debug(`\x1b[34m${formattedMessage}\x1b[0m` + metadataString);
      break;
    case 'info':
      console.log(`\x1b[32m${formattedMessage}\x1b[0m` + metadataString);
      break;
    case 'warn':
      console.warn(`\x1b[33m${formattedMessage}\x1b[0m` + metadataString);
      break;
    case 'error':
      console.error(`\x1b[31m${formattedMessage}\x1b[0m` + metadataString);
      break;
  }
};

const debug = (service: string, message: string, metadata?: unknown) => {
  print('debug', service, message, metadata);
};

const info = (service: string, message: string, metadata?: unknown) => {
  print('info', service, message, metadata);
};

const warn = (service: string, message: string, metadata?: unknown) => {
  print('warn', service, message, metadata);
};

const error = (service: string, message: string, metadata?: unknown) => {
  print('error', service, message, metadata);
};

export const logger = {
  debug,
  info,
  warn,
  error,
};
