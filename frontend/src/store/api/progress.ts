import type { ProgressListResponse, ProgressRequest } from '@miauflix/backend-client';
import { hcWithType } from '@miauflix/backend-client';
import { createApi } from '@reduxjs/toolkit/query/react';

import { API_URL } from '../../consts';

const client = hcWithType(API_URL);

export const progressApi = createApi({
  reducerPath: 'progressApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  tagTypes: ['Progress'],
  endpoints: builder => ({
    // Track media progress
    trackMediaProgress: builder.mutation<boolean, ProgressRequest>({
      async queryFn(progressData) {
        try {
          const res = await client.progress.$post({
            json: progressData,
          });
          if (res.status === 204) {
            return { data: true };
          }
          if (res.status === 200) {
            const data = (await res.json()) as { success?: boolean };
            return { data: data?.success ?? true };
          }
          const data = (await res.json()) as { error?: string };
          return {
            error: {
              status: res.status,
              data: 'error' in data ? data.error : 'Failed to track progress',
            },
          };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
      invalidatesTags: ['Progress'],
    }),

    // Get progress list for the authenticated user
    getProgress: builder.query<ProgressListResponse, void>({
      async queryFn() {
        try {
          // For now, return empty array since the backend returns empty array
          // TODO: Implement when backend is ready
          return {
            data: { progress: [] },
          };
        } catch (error: any) {
          return {
            error: { status: error?.status || 500, data: error?.message || 'Unknown error' },
          };
        }
      },
      providesTags: ['Progress'],
    }),
  }),
});

export const { useTrackMediaProgressMutation, useGetProgressQuery } = progressApi;
