/**
 * Validate JWT token payload structure
 */
export function validateTokenPayload(
  payload: unknown
): payload is { userId: string; email: string; role: string } {
  return (
    payload != null &&
    typeof payload === 'object' &&
    'userId' in payload &&
    'email' in payload &&
    'role' in payload &&
    typeof (payload as { userId: unknown }).userId === 'string' &&
    typeof (payload as { email: unknown }).email === 'string' &&
    typeof (payload as { role: unknown }).role === 'string' &&
    (payload as { userId: string }).userId.length > 0 &&
    (payload as { email: string }).email.length > 0 &&
    (payload as { role: string }).role.length > 0
  );
}
