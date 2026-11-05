/** The backend takes one logout a second from a device; a turned-away one is tried again. */
const LOGOUT_INTERVAL_MS = 1100;
const LOGOUT_ATTEMPTS = 3;

/** End sessions one after the other, within the backend's logout rate. */
export async function logOutSessions(
  sessions: readonly string[],
  logOut: (session: string) => PromiseLike<{ error?: unknown }>
): Promise<void> {
  const wait = () => new Promise(resolve => setTimeout(resolve, LOGOUT_INTERVAL_MS));
  let first = true;
  for (const session of sessions) {
    for (let attempt = 0; attempt < LOGOUT_ATTEMPTS; attempt++) {
      if (!first) await wait();
      first = false;
      const result = await logOut(session);
      if ((result.error as { status?: unknown } | undefined)?.status !== 429) break;
    }
  }
}
