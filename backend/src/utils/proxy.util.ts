import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';

// Header name for the reverse proxy secret
const PROXY_SECRET_HEADER = 'x-reverse-proxy-secret';

/**
 * Gets the real client IP address from a request considering X-Forwarded-For header,
 * but only when the request includes a valid reverse proxy secret header
 *
 * @param context - The HTTP context
 * @param proxySecret - The shared secret configured for the reverse proxy
 * @returns The real client IP address or the direct IP if validation fails
 */
export const getRealClientIp = (
  context: Context | undefined,
  proxySecret: string | undefined
): string | undefined => {
  const ipAddress = context ? getConnInfo(context).remote.address : undefined;

  // If no secret is configured, don't trust X-Forwarded-For headers
  if (!proxySecret) {
    return ipAddress;
  }

  // Check if the request has the correct secret
  const requestSecret = context?.req.header(PROXY_SECRET_HEADER);
  if (!requestSecret || requestSecret !== proxySecret) {
    return ipAddress; // No secret or invalid secret, don't trust X-Forwarded-For
  }

  // If we have a valid secret, get the X-Forwarded-For header
  const forwardedFor = context?.req.header('x-forwarded-for');
  if (!forwardedFor) {
    return ipAddress; // No X-Forwarded-For header, use direct IP
  }

  // X-Forwarded-For format: client, proxy1, proxy2, ...
  // We want the leftmost (client) IP
  const ips = forwardedFor.split(',').map(ip => ip.trim());

  // Return the client IP (leftmost in the chain) if available
  return ips[0] || ipAddress;
};
