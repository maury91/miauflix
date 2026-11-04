import { afterEach, expect, mock, spyOn, test } from 'bun:test';

import { handleRequest } from './trakt/trakt.handleRequest';

afterEach(() => mock.restore());

test('the mock server logs unexpected failures but sends only a generic error', async () => {
  let fetchHandler!: (req: Request) => Promise<Response>;
  spyOn(Bun, 'serve').mockImplementation(options => {
    fetchHandler = options.fetch as typeof fetchHandler;
    return {} as never;
  });
  spyOn(console, 'log').mockImplementation(() => {});
  const log = spyOn(console, 'error').mockImplementation(() => {});
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = '/unused-mock-fixtures';
  try {
    await import('./index');
  } finally {
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
  }
  const failure = Object.assign(new Error('private database path'), {
    stack: 'private stack trace',
  });
  spyOn(Bun, 'file').mockImplementation(() => {
    throw failure;
  });

  const response = await fetchHandler(new Request('http://mock.invalid/unexpected'));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'Failed to process request' });
  expect(log).toHaveBeenCalledWith('Error handling request:', failure);
});

test('the OAuth mock keeps exception details out of both response and fixture data', async () => {
  spyOn(console, 'log').mockImplementation(() => {});
  const log = spyOn(console, 'error').mockImplementation(() => {});
  // Select a deterministic failure from the mock. Recording is explicitly disabled.
  spyOn(Math, 'random').mockReturnValue(0);
  const result = await handleRequest({
    req: new Request('http://mock.invalid/oauth/device/token', { method: 'POST' }),
    path: '/oauth/device/token',
    method: 'POST',
    queryParams: {},
    filePath: '/unused',
    API_KEY: '',
    API_SECRET: '',
    API_HEADERS: {},
    API_AUTH_HEADER: 'Authorization',
    API_AUTH_HEADER_IS_BEARER: true,
    RECORD_PROVIDER_FIXTURES: false,
  });
  expect(result).not.toBeNull();
  expect(result!.response.status).toBe(500);
  expect(await result!.response.json()).toEqual({ error: 'Failed to process OAuth request' });
  expect(result!.data).toEqual({ error: 'Failed to process OAuth request' });
  expect(result!.store).toBe(false);
  expect(log).toHaveBeenCalled();
});
