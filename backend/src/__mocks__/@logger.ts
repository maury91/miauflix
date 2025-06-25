export const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

if (process.argv.includes('--verbose')) {
  logger.debug.mockImplementation((message, ...args) => {
    console.debug(message, ...args);
  });
  logger.info.mockImplementation((message, ...args) => {
    console.info(message, ...args);
  });
  logger.warn.mockImplementation((message, ...args) => {
    console.warn(message, ...args);
  });
  logger.error.mockImplementation((message, ...args) => {
    console.error(message, ...args);
  });
}
