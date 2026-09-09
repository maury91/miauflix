import { serviceErrorSchema } from '@miauflix/service-contracts';
import { ZodError } from 'zod';

import { HttpError } from '../errors';
import { logger } from '../logger';

export type RouteParams = Record<string, string>;

export { HttpError };

export interface RequestContext {
  req: Request;
  url: URL;
  params: RouteParams;
  json(body: unknown, status?: number): Response;
}

export type RouteHandler = (ctx: RequestContext) => Response | Promise<Response>;

export interface Route {
  method: string;
  /** Segments split on '/'; ':name' captures a parameter. */
  pattern: string;
  handler: RouteHandler;
}

export class Router {
  private readonly routes: Route[] = [];

  add(method: string, pattern: string, handler: RouteHandler): this {
    this.routes.push({ method: method.toUpperCase(), pattern, handler });
    return this;
  }

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathSegments = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);

    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const params = matchPattern(route.pattern, pathSegments);
      if (!params) continue;

      const ctx: RequestContext = {
        req,
        url,
        params,
        json: (body, status = 200) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
      };
      try {
        return await route.handler(ctx);
      } catch (error) {
        if (error instanceof ZodError) {
          return Response.json(
            serviceErrorSchema.parse({
              code: 'invalid_contract_payload',
              message: 'Request does not match the service contract',
              details: error.issues,
            }),
            { status: 400 }
          );
        }
        if (error instanceof HttpError) {
          return Response.json(
            serviceErrorSchema.parse({ code: error.code, message: error.message }),
            { status: error.status }
          );
        }
        logger.error('Http', `${req.method} ${url.pathname} failed`, error);
        return Response.json(
          serviceErrorSchema.parse({ code: 'internal_error', message: 'Internal Server Error' }),
          { status: 500 }
        );
      }
    }

    return Response.json(
      serviceErrorSchema.parse({
        code: 'route_not_found',
        message: `No route for ${req.method} ${url.pathname}`,
      }),
      { status: 404 }
    );
  }
}

const matchPattern = (pattern: string, segments: string[]): RouteParams | null => {
  const patternSegments = pattern.split('/').filter(Boolean);
  if (patternSegments.length !== segments.length) return null;

  const params: RouteParams = {};
  for (let index = 0; index < patternSegments.length; index++) {
    const expected = patternSegments[index];
    const actual = segments[index];
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
};
