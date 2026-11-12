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
      code: 'internal',
      errorId: 'abcd1234',
      needsConfiguration: false,
      inConsole: true,
    });
  });

  it('marks a configuration problem and keeps its hint', () => {
    expect(
      presentError(
        { ...body, status: 503, needsConfiguration: true, hint: 'Configure TMDB' },
        'Failed'
      )
    ).toMatchObject({ hint: 'Configure TMDB', needsConfiguration: true, errorId: 'abcd1234' });
  });

  it('falls back when the server sent nothing usable', () => {
    expect(presentError({ status: 500, data: 'Request failed' }, 'Failed to load')).toEqual({
      message: 'Failed to load',
      needsConfiguration: false,
      inConsole: true,
    });
    expect(presentError(null, 'Failed to load')).toEqual({
      message: 'Failed to load',
      needsConfiguration: false,
      inConsole: false,
    });
  });

  it('passes on the raw detail the server sends to admins', () => {
    expect(presentError({ ...body, detail: 'SQLITE_BUSY' }, 'Failed')).toMatchObject({
      detail: 'SQLITE_BUSY',
      errorId: 'abcd1234',
    });
  });
});
