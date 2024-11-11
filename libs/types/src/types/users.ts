export interface UserDto {
  id: number;
  name: string;
  slug: string;
}

export interface DeviceLoginDto {
  codeUrl: string;
  deviceCode: string;
  expiresAt: number;
  interval: number;
}

export interface DeviceLoginStatusDto {
  loggedIn: boolean;
}
