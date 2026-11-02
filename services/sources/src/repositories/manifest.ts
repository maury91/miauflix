import { z } from 'zod';

import { PROWLARR_SOURCE_KEY } from '../providers/cardigann/sources';

const settingValue = z.union([z.string(), z.boolean()]);
const entry = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/),
    name: z.string().trim().min(1).max(100),
    version: z.string().min(1).max(50),
    kind: z.enum(['cardigann', 'torznab', 'http']),
    cardigann: z.string().optional(), // Definition id within its source
    source: z.string().trim().min(1).max(300).default(PROWLARR_SOURCE_KEY),
    baseUrl: z.string().url().optional(), // torznab/http
    defaults: z
      .object({
        enabled: z.boolean().default(false),
        priority: z.number().int().min(1).max(999).default(100),
        dailyBudget: z.number().int().positive().nullable().default(null),
        perMinute: z.number().positive().optional(),
      })
      .default({ enabled: false, priority: 100, dailyBudget: null }),
    settings: z.record(z.string(), settingValue).optional(),
  })
  .superRefine((value, ctx) => {
    const required = {
      cardigann: value.cardigann,
      torznab: value.baseUrl,
      http: value.baseUrl,
    }[value.kind];
    if (!required)
      ctx.addIssue({
        code: 'custom',
        message: `${value.kind} providers need ${value.kind === 'cardigann' ? 'cardigann' : 'baseUrl'}`,
      });
  });

export const manifestSchema = z.array(entry).max(500);
export type ManifestEntry = z.infer<typeof entry>;
