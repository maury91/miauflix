import { hcWithType } from '@miauflix/backend';
import { API_CREDENTIALS, API_URL, builtForTizen } from '@shared/config/constants';

import { tvAuthFetch } from './tv-auth';

// Shared typed backend client used by all feature APIs. The TV build sends its tokens as headers
// because the backend's cookies never reach an app running from local files.
export const backendClient = hcWithType(API_URL, {
  fetch: builtForTizen ? tvAuthFetch : undefined,
  init: {
    credentials: API_CREDENTIALS,
  },
});
