import { hcWithType } from '@miauflix/backend-client';
import { createApi } from '@reduxjs/toolkit/query/react';

import { API_URL } from '@/consts';

const client = hcWithType(API_URL);

interface HealthResponse {
  status: string;
}

export const healthApi = createApi({
  reducerPath: 'healthApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  endpoints: builder => ({
    checkHealth: builder.query<HealthResponse, void>({
      async queryFn() {
        try {
          const res = await client.api.health.$get();
          if (res.status === 200) {
            const data = await res.json();
            return { data };
          }
          return {
            error: {
              status: res.status,
              data: 'Health check failed',
            },
          };
        } catch (error: any) {
          return {
            error: {
              status: error?.status || 500,
              data: error?.message || 'Server unavailable',
            },
          };
        }
      },
    }),
  }),
});

export const { useCheckHealthQuery, useLazyCheckHealthQuery } = healthApi;
