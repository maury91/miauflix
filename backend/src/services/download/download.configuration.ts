import { access, constants, mkdir } from 'fs/promises';
import path from 'path';

import { ENV } from '@constants';
import { serviceConfiguration, transforms, variable } from '@utils/config';

export const downloadConfigurationDefinition = serviceConfiguration({
  name: 'Download',
  description: 'Download and streaming configuration',
  variables: {
    DOWNLOAD_PATH: variable({
      description: 'Directory for storing downloaded media files (must be writable)',
      required: false,
      defaultValue: path.resolve(process.cwd(), './downloads'),
      example: '/var/miauflix/cache',
      transform: transforms.string({ minLength: 1 }),
    }),
    DOWNLOAD_SALT: variable({
      description: 'Salt for generating secure storage paths (32+ character random string)',
      required: false,
      defaultValue: 'miauflix-download-cache-salt-2024-secure-random-string',
      example: 'your-32-character-random-salt-string',
      transform: transforms.string({ minLength: 32 }),
    }),
  },
  test: async () => {
    // Test that the cache directory is writable
    const cachePath = ENV('DOWNLOAD_PATH');
    try {
      await mkdir(cachePath, { recursive: true });
      await access(cachePath, constants.W_OK);
    } catch (error) {
      console.error(error);
      throw new Error(
        `Download cache path ${cachePath} is not writable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});
