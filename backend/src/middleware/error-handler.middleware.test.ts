jest.mock('@logger');

import { logger } from '@logger';
import { Hono } from 'hono';

import { HttpError } from '@errors/http.error';

import { handleError } from './error-handler.middleware';

const setupTest = () => {
  const app = new Hono()
    .get('/api/stream/:token', () => {
      throw new HttpError(404, 'Unavailable');
    })
    .get('/api/auth/qr/:approvalToken', () => {
      throw new HttpError(404, 'Unavailable');
    })
    .onError(handleError);
  const loggedLine = () => String(jest.mocked(logger.error).mock.calls.at(-1)?.[1]);
  return { app, loggedLine };
};

describe('handleError', () => {
  beforeEach(() => jest.mocked(logger.error).mockClear());

  it.each([
    ['a short token', '/api/stream/short.tok'],
    [
      'a percent-encoded token',
      `/api/stream/${[...'secret-token'].map(ch => `%${ch.charCodeAt(0).toString(16)}`).join('')}`,
    ],
    ['an encoded route prefix', '/api/%73tream/secret-token'],
    ['a QR approval token', '/api/auth/qr/secret-token'],
  ])('keeps %s out of the log', async (_case, path) => {
    const { app, loggedLine } = setupTest();

    const response = await app.request(path);

    expect(response.status).toBe(404);
    expect(loggedLine()).toContain('REDACTED');
    expect(loggedLine()).not.toMatch(/secret-token|short\.tok|%73%65/);
  });
});
