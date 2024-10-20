import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { queues } from '../../queues';
import { AuthController } from './auth.controller';
import { DeviceCodeProcessor } from './deviceCode.processor';
import { TraktService } from '../trakt/trakt.service';
import { AuthService } from './auth.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from '../database/entities/user.entity';
import { UserService } from '../user/user.service';
import { AccessToken } from '../database/entities/accessToken.entity';

@Module({
  imports: [
    BullModule.registerQueue({
      name: queues.deviceCode,
    }),
    HttpModule,
    SequelizeModule.forFeature([User, AccessToken]),
  ],
  controllers: [AuthController],
  providers: [
    DeviceCodeProcessor,
    TraktService,
    AuthService,
    UserService,
    ConfigService,
  ],
  exports: [SequelizeModule],
})
export class AuthModule {}
