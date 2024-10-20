import { Controller, Get, Param } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('deviceCode')
  getDeviceCode() {
    return this.authService.startDeviceLogin();
  }

  @Get('verifyLogin/:deviceCode')
  getUserByDeviceCode(@Param('deviceCode') deviceCode: string) {
    return this.authService.checkUserLogin(deviceCode);
  }
}
