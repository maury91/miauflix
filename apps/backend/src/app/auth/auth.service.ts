import { Injectable, Logger } from '@nestjs/common';
import { TraktApi } from '../trakt/trakt.api';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  queues,
  deviceCodeJobs,
  CheckForAccessTokenData,
} from '@miauflix/types';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserData } from '../user/user.data';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly traktService: TraktApi,
    private readonly userData: UserData,
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
    const user = await this.userData.findUserByDeviceCode(deviceCode);
    return !!user;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async renewTokensAboutToExpire() {
    const expiringTokens = await this.userData.getExpiringTokens();
    for (const token of expiringTokens) {
      this.logger.log('Renewing token for user', token.userId);
      const newToken = await this.traktService.refreshToken(token.refreshToken);
      this.logger.log('Got new token');
      await this.userData.updateToken({
        ...token,
        createdAt: new Date(newToken.created_at * 1000),
        accessToken: newToken.access_token,
        refreshToken: newToken.refresh_token,
        expiresIn: newToken.expires_in,
      });
    }
  }
}
