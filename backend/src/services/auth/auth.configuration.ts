import { randomBytes } from 'crypto';

import { serviceConfiguration, transforms, variable } from '@utils/config';

export const jwtConfigurationDefinition = serviceConfiguration({
  name: 'JWT Authentication',
  description: 'Configuration for JWT authentication',
  variables: {
    JWT_SECRET: variable({
      description: 'Secret key for JWT token signing',
      example: 'a-random-secret-key',
      defaultValue: () => randomBytes(32).toString('hex'),
      required: true,
      skipUserInteraction: true,
    }),
    STREAM_TOKEN_SECRET: variable({
      description: 'Secret key for streaming token signing',
      example: 'a-random-streaming-secret-key',
      defaultValue: () => randomBytes(32).toString('hex'),
      required: true,
      skipUserInteraction: true,
    }),
    STREAM_TOKEN_EXPIRATION: variable({
      description:
        'Expiration time for streaming tokens (format: number + unit, e.g., 6h, 30m, 2d)',
      example: '6h',
      defaultValue: '6h',
      required: false,
      transform: transforms.time(['s', 'm', 'h', 'd']),
    }),
    STREAM_KEY_SALT: variable({
      description: 'Salt for generating deterministic streaming key hashes',
      example: 'a-random-streaming-salt-key',
      defaultValue: () => randomBytes(32).toString('hex'),
      required: true,
      skipUserInteraction: true,
    }),
    REFRESH_TOKEN_COOKIE_NAME: variable({
      description: 'Name for the refresh token HttpOnly cookie',
      example: '__refresh_token',
      defaultValue: '__miauflix_rt',
      required: false,
      skipUserInteraction: true,
    }),
    ACCESS_TOKEN_COOKIE_NAME: variable({
      description: 'Name for the access token HttpOnly cookie',
      example: '__access_token',
      defaultValue: '__miauflix_at',
      required: false,
      skipUserInteraction: true,
    }),
    COOKIE_DOMAIN: variable({
      description: 'Domain for refresh token cookies (leave empty for same-origin)',
      example: 'example.com',
      required: false,
      transform: transforms.optional(
        transforms.domain({ allowLocalhost: process.env.NODE_ENV !== 'production' })
      ),
    }),
    COOKIE_SECURE: variable({
      description: 'Whether to use secure flag for cookies (HTTPS only)',
      example: 'true',
      defaultValue: 'false',
      required: false,
      transform: transforms.boolean(),
    }),
    REFRESH_TOKEN_EXPIRATION: variable({
      description: 'Expiration time for refresh tokens (format: number + unit, e.g., 7d, 15m, 1h)',
      example: '7d',
      defaultValue: '7d',
      required: false,
      transform: transforms.time(['s', 'm', 'h', 'd']),
    }),
    ACCESS_TOKEN_EXPIRATION: variable({
      description: 'Expiration time for access tokens (format: number + unit, e.g., 15m, 1h)',
      example: '15m',
      defaultValue: '15m',
      required: false,
      transform: transforms.time(['s', 'm', 'h', 'd']),
    }),
    REFRESH_TOKEN_MAX_REFRESH_DAYS: variable({
      description: 'Maximum number of days a refresh token chain can be refreshed',
      example: '30',
      defaultValue: '30',
      required: false,
      transform: transforms.number({ min: 1, max: 365, integer: true }),
    }),
    MAX_DEVICE_SLOTS_PER_USER: variable({
      description: 'Maximum number of device slots allowed per user',
      example: '5',
      defaultValue: '5',
      required: false,
      transform: transforms.number({ min: 1, max: 20, integer: true }),
    }),
  },
  test: async () => {
    return;
  },
});
