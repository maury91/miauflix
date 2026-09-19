import { z } from 'zod';

export const MANAGEMENT_PROTOCOL_VERSION = 1 as const;
export const SERVICE_MANIFEST_PATH = '/service' as const;

const relativePathSchema = z
  .string()
  .regex(/^\/(?!\/)/)
  .refine(path => !/[\\\u0000-\u001F\u007F]/.test(path));

export const serviceCapabilitySchema = z.object({
  version: z.number().int().positive(),
  basePath: relativePathSchema,
});

export const serviceManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  description: z.string(),
  version: z.string().min(1),
  managementProtocolVersion: z.number().int().positive(),
  capabilities: z.record(z.string(), serviceCapabilitySchema),
  management: z.object({
    statusPath: relativePathSchema,
    statusEventsPath: relativePathSchema.optional(),
    configurationSchemaPath: relativePathSchema,
    configurationStatePath: relativePathSchema,
    configurationTestPath: relativePathSchema,
    configurationApplyPath: relativePathSchema,
  }),
});

export const serviceLifecycleStateSchema = z.enum([
  'standby',
  'configuring',
  'ready',
  'degraded',
  'error',
]);

export const serviceStatusSchema = z.object({
  state: serviceLifecycleStateSchema,
  message: z.string().optional(),
  errorCode: z.string().optional(),
  missingConfiguration: z.array(z.string()).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const configInputTypeSchema = z.enum(['boolean', 'number', 'password', 'select', 'text']);

export const configVariableSchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  description: z.string(),
  required: z.boolean(),
  secret: z.boolean().optional(),
  inputType: configInputTypeSchema,
  defaultValue: z.string().optional(),
  example: z.string().optional(),
  options: z.record(z.string(), z.string()).optional(),
  numberOptions: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      integer: z.boolean().optional(),
    })
    .optional(),
  booleanStateDescriptions: z.object({ true: z.string(), false: z.string() }).optional(),
  link: z.string().url().optional(),
  linkLabel: z.string().optional(),
  testRelevant: z.boolean().optional(),
  testFailureHelp: z.string().optional(),
});

export const serviceConfigSchemaSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  variables: z.array(configVariableSchema),
});

export const serviceConfigStateSchema = z.object({
  configuredKeys: z.array(z.string()),
});

export const serviceConfigMutationSchema = z.object({
  values: z.record(z.string(), z.string()),
  unsetKeys: z.array(z.string()).default([]),
});

export const serviceConfigTestResultSchema = z.object({
  success: z.boolean(),
  mode: z.enum(['live', 'validation']),
  message: z.string(),
  invalidKeys: z.array(z.string()).optional(),
});

export const serviceConfigApplyResultSchema = z.object({
  success: z.boolean(),
  reloaded: z.boolean(),
  invalidKeys: z.array(z.string()).optional(),
  test: serviceConfigTestResultSchema.optional(),
});

export const serviceErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ServiceManifest = z.infer<typeof serviceManifestSchema>;
export type ServiceLifecycleState = z.infer<typeof serviceLifecycleStateSchema>;
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
export type ConfigVariable = z.infer<typeof configVariableSchema>;
export type ServiceConfigSchema = z.infer<typeof serviceConfigSchemaSchema>;
export type ServiceConfigState = z.infer<typeof serviceConfigStateSchema>;
export type ServiceConfigMutation = z.input<typeof serviceConfigMutationSchema>;
export type ServiceConfigTestResult = z.infer<typeof serviceConfigTestResultSchema>;
export type ServiceConfigApplyResult = z.infer<typeof serviceConfigApplyResultSchema>;
export type ServiceError = z.infer<typeof serviceErrorSchema>;
