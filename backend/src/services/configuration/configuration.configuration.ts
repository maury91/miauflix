import path from 'path';

import { serviceConfiguration, transforms, variable } from '@utils/config';

export const serverConfigurationDefinition = serviceConfiguration({
  name: 'Server',
  description: 'Server configuration',
  restartable: false,
  variables: {
    CORS_ORIGIN: variable({
      description: "Allowed origins for CORS (comma-separated list or '*' for all origins)",
      required: false,
      defaultValue:
        'http://localhost:3000,http://localhost:4173,http://localhost:4174,http://localhost:4175',
      example: 'http://localhost:3000,https://myapp.com',
      transform: transforms.stringArray(),
    }),
    PORT: variable({
      description: 'Port for the server to listen on',
      required: false,
      defaultValue: '3000',
      example: '3000',
      transform: transforms.number({ min: 1, max: 65535, integer: true }),
    }),
    DATA_DIR: variable({
      description: 'Directory for storing data files',
      required: false,
      defaultValue: path.resolve(process.cwd(), './data'),
      example: '/path/to/data',
      transform: transforms.string({ minLength: 1 }),
    }),
    MAXIMUM_CACHE_EMPTY_SPACE: variable({
      description:
        'Cache will be cleaned periodically, however, the database file will not shrink automatically, empty space will be reused in the future, this is the maximum size of the empty space',
      required: false,
      defaultValue: '10MB',
      example: '10MB',
      transform: transforms.size(['B', 'KB', 'MB', 'GB', 'TB']),
    }),
    REVERSE_PROXY_SECRET: variable({
      description:
        'Secret key shared between the reverse proxy and the backend to validate requests',
      required: false,
      defaultValue: '',
      example: 'your-secure-random-string',
      transform: transforms.optional(transforms.string({ minLength: 16 })),
    }),
    DISABLE_BACKGROUND_TASKS: variable({
      description: 'Disable all background tasks for testing on-demand functionality',
      required: false,
      defaultValue: 'false',
      example: 'true',
      transform: transforms.boolean(),
    }),
    ALLOW_CREATE_ADMIN_ON_FIRST_RUN: variable({
      description:
        'When enabled, the initial admin user is not automatically created on first run. ' +
        'An unauthenticated POST /api/auth/setup endpoint is exposed to create the first admin. ' +
        'The endpoint is disabled once any admin user exists.',
      required: false,
      defaultValue: 'false',
      example: 'true',
      transform: transforms.boolean(),
    }),
    NODE_ENV: variable({
      description: 'Node.js environment mode',
      required: false,
      defaultValue: 'development',
      example: 'production',
    }),
    DEBUG: variable({
      description:
        'Enable debug output for specific modules (e.g. "Jaeger" for OTLP tracing debug logs)',
      required: false,
      defaultValue: '',
      example: 'Jaeger',
    }),
    ENABLE_TRACING: variable({
      description: 'Enable OpenTelemetry distributed tracing',
      required: false,
      defaultValue: 'false',
      example: 'true',
      transform: transforms.boolean(),
    }),
    OTEL_EXPORTER_OTLP_ENDPOINT: variable({
      description: 'OTLP endpoint URL for exporting traces (e.g. Jaeger)',
      required: false,
      defaultValue: '',
      example: 'http://localhost:4318',
    }),
    ENABLE_OTLP: variable({
      description:
        'Enable OTLP trace export to localhost:4318 when no OTEL_EXPORTER_OTLP_ENDPOINT is set',
      required: false,
      defaultValue: 'false',
      example: 'true',
      transform: transforms.boolean(),
    }),
    TRACE_DIR: variable({
      description: 'Directory for writing trace span files',
      required: false,
      defaultValue: '/tmp',
      example: '/data/traces',
    }),
    TRACE_MAX_TRACES: variable({
      description: 'Maximum number of traces to retain in the trace file',
      required: false,
      defaultValue: '1000',
      example: '500',
      transform: transforms.number({ min: 0, integer: true }),
    }),
    FRONTEND_DIR: variable({
      description: 'If set, the backend will serve static frontend files from this directory',
      required: false,
      example: '/usr/src/app/public',
    }),
    ENABLE_FRONTEND: variable({
      description: 'Enable the frontend',
      required: false,
      defaultValue: 'true',
      example: 'true',
      transform: transforms.boolean(),
    }),
    FLARESOLVERR_URL: variable({
      description: 'URL for FlareSolverr instance to bypass Cloudflare protection',
      required: false,
      defaultValue: '',
      example: 'http://localhost:8191',
      transform: transforms.optional(transforms.url()),
    }),
    ENABLE_FLARESOLVERR: variable({
      description: 'Enable FlareSolverr for bypassing Cloudflare protection on 403 responses',
      required: false,
      defaultValue: 'false',
      example: 'true',
      transform: transforms.boolean(),
    }),
  },
});
