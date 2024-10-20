import { Processor, WorkerHost } from '@nestjs/bullmq';
import { CheckForAccessTokenData, queues } from '../../queues';
import { Job } from 'bullmq';
import { TraktService } from '../trakt/trakt.service';
import { UserService } from '../user/user.service';

@Processor(queues.deviceCode)
export class DeviceCodeProcessor extends WorkerHost {
  constructor(
    private readonly traktService: TraktService,
    private readonly userService: UserService
  ) {
    super();
  }

  async process(job: Job<CheckForAccessTokenData>) {
    // Check for code
    const deviceCode = job.data;
    const token = await this.traktService.checkDeviceCode(deviceCode);
    // 1fc41ffc2b5784b99502bcc292cbeeaa000f1e665ff9bda9b9257275bffaed02
    // 3cc8f83aba1b4b1c6ad94316d345590774ed212b7f11b087a1bdfec7ed3a6998
    const user = await this.traktService.getProfile(token.access_token);
    await this.userService.createUser({
      name: user.name,
      slug: user.ids.slug,
      accessTokens: [
        {
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          tokenType: token.token_type,
          expiresIn: token.expires_in,
          scope: token.scope,
          deviceCode,
        },
      ],
    });
  }
}
