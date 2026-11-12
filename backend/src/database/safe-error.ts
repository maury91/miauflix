/**
 * What can be logged about a failed query: TypeORM's QueryFailedError carries the statement's
 * `parameters` (and the driver error repeats them), which hold the row being written — emails,
 * addresses, request metadata. Only the error's name, message and driver code are kept.
 */
export function describeDatabaseError(error: unknown): {
  name: string;
  message: string;
  code?: string;
} {
  if (!(error instanceof Error)) return { name: 'Error', message: String(error) };
  const code =
    (error as { code?: unknown; driverError?: { code?: unknown } }).driverError?.code ??
    (error as { code?: unknown }).code;
  return {
    name: error.name,
    message: error.message,
    ...(typeof code === 'string' && { code }),
  };
}
