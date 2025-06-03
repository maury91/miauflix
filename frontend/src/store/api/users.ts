import { DeviceLoginDto, DeviceLoginStatusDto, UserDto } from '../../types/api';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../../consts';

export const usersApi = createApi({
  reducerPath: 'usersApi',
  tagTypes: ['User'],
  baseQuery: fetchBaseQuery({ baseUrl: `${API_URL}/` }),
  endpoints: builder => ({
    getUsers: builder.query<UserDto[], void>({
      query: () => 'users',
      providesTags: ['User'],
    }),
    deviceLogin: builder.query<DeviceLoginDto, void>({
      query: () => 'auth/deviceCode',
    }),
    checkDeviceLoginStatus: builder.mutation<DeviceLoginStatusDto, string>({
      query: deviceCode => `auth/verifyLogin/${deviceCode}`,
      invalidatesTags: result => {
        if (result?.loggedIn) {
          return [{ type: 'User' }];
        }
        return [];
      },
    }),
  }),
});

export const { useGetUsersQuery, useDeviceLoginQuery, useCheckDeviceLoginStatusMutation } =
  usersApi;
