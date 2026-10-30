import type { BuiltInErrorCode } from './define.js';

/** A failure with a code declared by the contract (or a built-in one). */
export class ContractError<C extends string = string> extends Error {
  override readonly name = 'ContractError';

  constructor(
    readonly code: C | BuiltInErrorCode,
    message: string = code
  ) {
    super(message);
  }
}

export const isContractError = <C extends string>(
  error: unknown,
  code?: C
): error is ContractError<C> =>
  error instanceof ContractError && (code === undefined || error.code === code);

/** Normalizes anything thrown by an implementation into a code + message pair. */
export const toWireError = (error: unknown): { code: string; message: string } => {
  if (error instanceof ContractError) return { code: error.code, message: error.message };
  return { code: 'internal', message: 'Internal service error' };
};

export const BUILT_IN_STATUS: Record<BuiltInErrorCode, number> = {
  unavailable: 503,
  not_configured: 503,
  cancelled: 499,
  timeout: 504,
  bad_request: 400,
  unsupported: 501,
  internal: 500,
};
