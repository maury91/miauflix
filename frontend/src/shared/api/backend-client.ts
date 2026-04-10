import { hcWithType } from '@miauflix/backend';
import { API_URL } from '@shared/config/constants';

// Shared typed backend client used by all feature APIs
export const backendClient = hcWithType(API_URL, {
  init: {
    credentials: 'include',
  },
});
