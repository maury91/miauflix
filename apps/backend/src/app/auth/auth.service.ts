import { Injectable } from '@nestjs/common';
import { TraktService } from '../trakt/trakt.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  queues,
  deviceCodeJobs,
  CheckForAccessTokenData,
} from '@miauflix/types';
import { UserService } from '../user/user.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class AuthService {
  constructor(
    private readonly traktService: TraktService,
    private readonly userService: UserService,
    @InjectQueue(queues.deviceCode)
    private deviceCodeQueue: Queue<CheckForAccessTokenData>
  ) {}

  async startDeviceLogin() {
    const response = await this.traktService.getDeviceCode();
    this.deviceCodeQueue.add(
      deviceCodeJobs.checkForAccessToken,
      response.deviceCode,
      {
        delay: response.interval * 1000,
        backoff: {
          delay: response.interval * 1000,
          type: 'fixed',
        },
        attempts: response.expiresIn / response.interval - 1,
        removeOnComplete: true,
        removeOnFail: true,
      }
    );
    return response;
  }

  async checkUserLogin(deviceCode: string) {
    const user = await this.userService.findUserByDeviceCode(deviceCode);
    return !!user;
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async renewTokensAboutToExpire() {
    const expiringTokens = await this.userService.getExpiringTokens();
    for (const token of expiringTokens) {
      const newToken = await this.traktService.refreshToken(token.refreshToken);
      await token.update({
        createdAt: new Date(),
        accessToken: newToken.access_token,
        refreshToken: newToken.refresh_token,
        expiresIn: newToken.expires_in,
      });
    }
  }
}
