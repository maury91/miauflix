import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

interface User {
  name: string;
  slug: string;
}

export const usersApi = createApi({
  reducerPath: 'usersApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/users` }),
  endpoints: (builder) => ({
    getUsers: builder.query<User[], void>({
      query: () => '',
    }),
  }),
});

export const { useGetUsersQuery } = usersApi;
