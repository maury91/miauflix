import { Controller, Get, Param } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DeviceLoginDto, DeviceLoginStatusDto } from '@miauflix/types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('deviceCode')
  async getDeviceCode(): Promise<DeviceLoginDto> {
    const { deviceCode, codeUrl, expiresIn, interval } =
      await this.authService.startDeviceLogin();
    return {
      deviceCode,
      codeUrl,
      expiresAt: Date.now() + expiresIn * 1000,
      interval,
    };
  }

  @Get('verifyLogin/:deviceCode')
  async getUserByDeviceCode(
    @Param('deviceCode') deviceCode: string
  ): Promise<DeviceLoginStatusDto> {
    return {
      loggedIn: await this.authService.checkUserLogin(deviceCode),
    };
  }
}
