import { UserDto } from '@miauflix/types';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

export const usersApi = createApi({
  reducerPath: 'usersApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/users` }),
  endpoints: (builder) => ({
    getUsers: builder.query<UserDto[], void>({
      query: () => '',
    }),
  }),
});

export const { useGetUsersQuery } = usersApi;
