import { Injectable } from '@nestjs/common';
import { TraktService } from '../trakt/trakt.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { queues, deviceCodeJobs, CheckForAccessTokenData } from '../../queues';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly traktService: TraktService,
    private readonly userService: UserService,
    // private readonly schedulerRegistry: SchedulerRegistry,
    // private readonly jwtService: JwtService,
    @InjectQueue(queues.deviceCode)
    private deviceCodeQueue: Queue<CheckForAccessTokenData>
  ) {}

  // private pollForAccessToken(deviceCode: string, interval: number) {
  //   const jobName = `deviceCodeJob__${deviceCode}`
  //   const checkForAccessToken = () => {
  //     if (authSucceed || ) {
  //       this.schedulerRegistry.deleteInterval(jobName)
  //     }
  //   }
  //
  //   const timer = setInterval(checkForAccessToken, interval);
  //   this.schedulerRegistry.addInterval(jobName, timer)
  // }

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
}
