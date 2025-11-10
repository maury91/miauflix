import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';

import type { CookieConfig } from '@services/auth/auth.service';

/**
 * Helper function to set cookies from a cookie configuration array
 */
export function setCookies(context: Context, cookies: CookieConfig[]): void {
  for (const cookie of cookies) {
    const { name, value, ...opts } = cookie;
    setCookie(context, name, value, opts);
  }
}
