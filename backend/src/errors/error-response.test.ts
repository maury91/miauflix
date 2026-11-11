import { ContractError } from '@miauflix/contract';

import { AuthError } from '@errors/auth.errors';
import { MediaError } from '@errors/media.errors';
import { ServiceNotConfiguredError } from '@errors/service-not-configured.error';
import { ServiceUnavailableError } from '@errors/service-unavailable.error';

import { describeError, newErrorId } from './error-response';

const describe_ = (error: unknown) => describeError(error, { errorId: 'abcd1234' });

describe('describeError', () => {
  it('generates short hex error ids', () => {
    expect(newErrorId()).toMatch(/^[0-9a-f]{8}$/);
  });

  it('tells how to fix an unconfigured catalog', () => {
    const { status, body } = describe_(new ServiceNotConfiguredError('CATALOG'));
    expect(status).toBe(503);
    expect(body).toMatchObject({
      success: false,
      code: 'service_not_configured',
      error: 'Media Catalog is not configured.',
      message: 'Media Catalog is not configured.',
      errorId: 'abcd1234',
      needsConfiguration: true,
      service: 'CATALOG',
      serviceName: 'Media Catalog',
    });
    expect(body.hint).toContain('TMDB');
  });

  it('keeps the reason a service reported', () => {
    const { body } = describe_(new ServiceNotConfiguredError('CATALOG', 'TMDB rejected the token'));
    expect(body.message).toBe('Media Catalog is not working: TMDB rejected the token');
  });

  it('maps auth errors to 401 with a code', () => {
    const { status, body, expected } = describe_(new AuthError());
    expect(status).toBe(401);
    expect(body.code).toBe('unauthorized');
    expect(expected).toBe(true);
  });

  it('reports an unavailable service without asking to configure it', () => {
    const { status, body } = describe_(
      new ServiceUnavailableError('CATALOG', 'TMDB is rate limiting requests, try again shortly.')
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({
      code: 'service_unavailable',
      message: 'Media Catalog is unavailable: TMDB is rate limiting requests, try again shortly.',
      service: 'CATALOG',
    });
    expect(body.needsConfiguration).toBeUndefined();
    expect(body.hint).not.toContain('configure');
  });

  it('maps contract codes to statuses without passing on service messages', () => {
    expect(
      describe_(new ContractError('internal', 'TMDB API error: (502) Bad Gateway'))
    ).toMatchObject({
      status: 500,
      expected: false,
      body: { code: 'service_internal', message: 'A backend service failed unexpectedly.' },
    });
    expect(describe_(new ContractError('timeout', 'slow'))).toMatchObject({
      status: 504,
      body: { code: 'service_timeout', message: 'A backend service took too long to answer.' },
    });
    expect(describe_(new ContractError('not_found', 'Movie 1 not found')).status).toBe(404);
  });

  it('uses the type/code of application errors and keeps their message out', () => {
    const { status, body } = describe_(new MediaError('List x not found', 'list_not_found'));
    expect(status).toBe(500);
    expect(body).toMatchObject({
      code: 'media/list_not_found',
      message: 'Something went wrong on the server.',
    });
  });

  it('never sends the message of an unexpected error', () => {
    const { body, expected } = describe_(new Error('ENOENT: /data/avatars/x.png'));
    expect(body).toMatchObject({
      status: 500,
      code: 'internal',
      message: 'Something went wrong on the server.',
    });
    expect(JSON.stringify(body)).not.toContain('ENOENT');
    expect(expected).toBe(false);
  });

  it('sends the raw message as detail only when asked (admins)', () => {
    const error = new Error('ENOENT: /data/avatars/x.png');
    const forAdmin = describeError(error, { errorId: 'abcd1234', includeDetail: true }).body;
    expect(forAdmin).toMatchObject({
      message: 'Something went wrong on the server.',
      detail: 'ENOENT: /data/avatars/x.png',
    });
    expect(
      describeError(new ContractError('internal', 'TMDB API error: (502) Bad Gateway'), {
        errorId: 'abcd1234',
        includeDetail: true,
      }).body.detail
    ).toBe('TMDB API error: (502) Bad Gateway');
    expect(describe_(error).body.detail).toBeUndefined();
    // Messages already meant for users need no detail.
    expect(
      describeError(new ServiceNotConfiguredError('CATALOG'), {
        errorId: 'abcd1234',
        includeDetail: true,
      }).body.detail
    ).toBeUndefined();
  });
});
