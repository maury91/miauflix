import { randomBytes } from 'crypto';

import { serviceConfiguration } from '@mytypes/configuration';

export const jwtConfigurationDefinition = serviceConfiguration({
  name: 'JWT Authentication',
  description: 'Configuration for JWT authentication',
  variables: {
    JWT_SECRET: {
      description: 'Secret key for JWT token signing',
      example: 'a-random-secret-key',
      defaultValue: randomBytes(32).toString('hex'),
      required: true,
      skipUserInteraction: true,
    },
    REFRESH_TOKEN_SECRET: {
      description: 'Secret key for refresh token signing',
      example: 'a-random-refresh-secret-key',
      defaultValue: randomBytes(32).toString('hex'),
      required: true,
      skipUserInteraction: true,
    },
  },
  test: async () => {
    return;
  },
});
