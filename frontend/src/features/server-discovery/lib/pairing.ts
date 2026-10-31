/** A code from the pairing service (tv-pairing/ at the repository root), shown on the TV. */
export interface TvPairing {
  code: string;
  secret: string;
  expiresAt: string;
  /** Seconds between polls. */
  pollInterval: number;
}

export type PairingPoll =
  | { status: 'pending' }
  | { status: 'paired'; server: { url: string; name?: string } }
  | { status: 'expired' };

export async function createTvPairing(pairingUrl: string): Promise<TvPairing> {
  const response = await fetch(`${pairingUrl}/v1/pairings`, {
    method: 'POST',
    credentials: 'omit',
  });
  if (!response.ok) throw new Error(`Pairing service answered ${response.status}`);
  return (await response.json()) as TvPairing;
}

/** Whether someone entered the code yet; the address comes once, then the code is gone. */
export async function pollTvPairing(pairingUrl: string, pairing: TvPairing): Promise<PairingPoll> {
  const response = await fetch(`${pairingUrl}/v1/pairings/${pairing.code}`, {
    credentials: 'omit',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${pairing.secret}` },
  });
  if (response.status === 404) return { status: 'expired' };
  if (response.status === 202) return { status: 'pending' };
  if (!response.ok) throw new Error(`Pairing service answered ${response.status}`);
  return (await response.json()) as PairingPoll;
}
