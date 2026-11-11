import { describe, expect, it } from 'vitest';

import { presentError } from './api-error';

const body = {
  success: false as const,
  status: 500,
  code: 'internal',
  error: 'Something went wrong on the server.',
  message: 'Something went wrong on the server.',
  errorId: 'abcd1234',
};

describe('presentError', () => {
  it('shows the error id of an unexpected server failure', () => {
    expect(presentError({ status: 500, data: body.message, details: body }, 'Failed')).toEqual({
      message: 'Something went wrong on the server.',
      hint: undefined,
      errorId: 'abcd1234',
      inConsole: true,
    });
  });

  it('shows how to fix a configuration problem instead of an id', () => {
    expect(
      presentError(
        { ...body, status: 503, needsConfiguration: true, hint: 'Configure TMDB' },
        'Failed'
      )
    ).toMatchObject({ hint: 'Configure TMDB', errorId: undefined });
  });

  it('falls back when the server sent nothing usable', () => {
    expect(presentError({ status: 500, data: 'Request failed' }, 'Failed to load')).toEqual({
      message: 'Failed to load',
      inConsole: true,
    });
    expect(presentError(null, 'Failed to load')).toEqual({
      message: 'Failed to load',
      inConsole: false,
    });
  });
});
