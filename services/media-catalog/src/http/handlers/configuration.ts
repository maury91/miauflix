import {
  serviceConfigApplyResultSchema,
  serviceConfigMutationSchema,
  serviceConfigSchemaSchema,
  serviceConfigTestResultSchema,
} from '@miauflix/service-contracts';

import type { ServiceContext } from '../../service-context';
import type { Router } from '../router';
import {
  CONFIGURATION_APPLY_PATH,
  CONFIGURATION_SCHEMA_PATH,
  CONFIGURATION_TEST_PATH,
} from './consts.ts';

const readMutation = async (req: Request) =>
  serviceConfigMutationSchema.parse(await req.json().catch(() => null));

export const registerConfigurationRoutes = (router: Router, ctx: ServiceContext): void => {
  // Served in every lifecycle state: the main app (CLI wizard and admin UI) drives
  // this service's configuration through these endpoints before it becomes ready.
  router.add('GET', CONFIGURATION_SCHEMA_PATH, ({ json }) =>
    json(serviceConfigSchemaSchema.parse(ctx.config.getSchema()))
  );

  // The main app's push — the service's "green flag".
  router.add('PUT', CONFIGURATION_APPLY_PATH, async ({ req, json }) => {
    const mutation = await readMutation(req);
    const result =
      'clear' in mutation
        ? await ctx.config.clearRemote()
        : await ctx.config.applyRemote(mutation.values);
    return json(serviceConfigApplyResultSchema.parse(result), result.success ? 200 : 400);
  });

  // Live probe with candidate values, without persisting anything.
  router.add('POST', CONFIGURATION_TEST_PATH, async ({ req, json }) => {
    const mutation = await readMutation(req);
    if ('clear' in mutation)
      return json(
        {
          success: false,
          mode: 'validation',
          message: 'A clear operation cannot be tested.',
          invalidKeys: [],
        },
        400
      );
    const result = await ctx.config.test(mutation.values);
    return json(serviceConfigTestResultSchema.parse(result), result.success ? 200 : 400);
  });
};
