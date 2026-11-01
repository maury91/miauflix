/** A server as announced to the pairing service (tv-pairing/ at the repository root). */
export interface AnnouncedServer {
  id: string;
  urls: string[];
  name?: string;
  lastSeen: string;
}

/**
 * The Miauflix servers that announced themselves from the TV's public IP, so the TV's own
 * network: the pairing service matches them by the address it sees requests come from.
 */
export async function lookupAnnouncedServers(pairingUrl: string): Promise<AnnouncedServer[]> {
  const response = await fetch(`${pairingUrl}/v1/discovery`, {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'client' }),
  });
  if (!response.ok) throw new Error(`Pairing service answered ${response.status}`);
  const body = (await response.json()) as { servers?: AnnouncedServer[] };
  return Array.isArray(body.servers) ? body.servers : [];
}
