import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { queues } from '@miauflix/types';
import { AuthController } from './auth.controller';
import { DeviceCodeProcessor } from './deviceCode.processor';
import { AuthService } from './auth.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: queues.deviceCode,
    }),
    HttpModule,
  ],
  controllers: [AuthController],
  providers: [DeviceCodeProcessor, AuthService, UserService, ConfigService],
  exports: [],
})
export class AuthModule {}
