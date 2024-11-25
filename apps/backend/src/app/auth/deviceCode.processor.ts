import { Processor, WorkerHost } from '@nestjs/bullmq';
import { CheckForAccessTokenData, queues } from '@miauflix/types';
import { Job } from 'bullmq';
import { TraktApi } from '../trakt/trakt.api';
import { UserData } from '../user/user.data';

@Processor(queues.deviceCode)
export class DeviceCodeProcessor extends WorkerHost {
  constructor(
    private readonly traktService: TraktApi,
    private readonly userData: UserData
  ) {
    super();
  }

  async process(job: Job<CheckForAccessTokenData>) {
    // Check for code
    const deviceCode = job.data;
    const token = await this.traktService.checkDeviceCode(deviceCode);
    try {
      const user = await this.traktService.getProfile(token.access_token);
      await this.userData.createUser({
        name: user.name,
        slug: user.ids.slug,
        accessTokens: [
          {
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            tokenType: token.token_type,
            expiresIn: token.expires_in,
            scope: token.scope,
            createdAt: new Date(token.created_at * 1000),
            deviceCode,
          },
        ],
      });
    } catch (err) {
      console.error(err);
    }
  }
}
