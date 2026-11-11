import { ContractError } from '@miauflix/contract';

import { AuthError } from '@errors/auth.errors';
import { MediaError } from '@errors/media.errors';
import { ServiceNotConfiguredError } from '@errors/service-not-configured.error';

import { describeError, newErrorId } from './error-response';

const describe_ = (error: unknown, authenticated = true) =>
  describeError(error, { errorId: 'abcd1234', authenticated });

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

  it('passes on a service message and maps contract codes to statuses', () => {
    expect(
      describe_(new ContractError('internal', 'TMDB API error: (502) Bad Gateway'))
    ).toMatchObject({
      status: 500,
      body: { code: 'service_internal', message: 'TMDB API error: (502) Bad Gateway' },
    });
    expect(describe_(new ContractError('internal', 'Internal service error')).body.message).toBe(
      'A backend service failed unexpectedly.'
    );
    expect(describe_(new ContractError('timeout', 'slow')).status).toBe(504);
    expect(describe_(new ContractError('not_found', 'Movie 1 not found')).status).toBe(404);
  });

  it('uses the type/code of application errors', () => {
    const { status, body } = describe_(new MediaError('List x not found', 'list_not_found'));
    expect(status).toBe(500);
    expect(body).toMatchObject({ code: 'media/list_not_found', message: 'List x not found' });
  });

  it('hides unexpected messages from anonymous callers only', () => {
    const error = new Error('SQLITE_BUSY: database is locked');
    expect(describe_(error, false).body).toMatchObject({
      status: 500,
      code: 'internal',
      message: 'Something went wrong on the server.',
    });
    expect(describe_(error, false).body.detail).toBeUndefined();
    expect(describe_(error, true).body.detail).toBe('SQLITE_BUSY: database is locked');
    expect(describe_(error).expected).toBe(false);
  });
});
