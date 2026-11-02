import { z } from 'zod';

const settingValue = z.union([z.string(), z.boolean()]);
const entry = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/),
    name: z.string().trim().min(1).max(100),
    version: z.string().min(1).max(50),
    kind: z.enum(['native', 'cardigann', 'torznab', 'http']),
    native: z.string().optional(), // native provider id
    cardigann: z.string().optional(), // Jackett definition id
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
      native: value.native,
      cardigann: value.cardigann,
      torznab: value.baseUrl,
      http: value.baseUrl,
    }[value.kind];
    if (!required)
      ctx.addIssue({
        code: 'custom',
        message: `${value.kind} providers need ${value.kind === 'native' || value.kind === 'cardigann' ? value.kind : 'baseUrl'}`,
      });
  });

export const manifestSchema = z.array(entry).max(500);
export type ManifestEntry = z.infer<typeof entry>;
