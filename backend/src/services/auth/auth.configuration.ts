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
    REFRESH_TOKEN_SECRET: variable({
      description: 'Secret key for refresh token signing',
      example: 'a-random-refresh-secret-key',
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
  },
  test: async () => {
    return;
  },
});
