import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AccessToken } from '../database/entities/accessToken.entity';

@Injectable()
export class UserData {
  constructor(
    @InjectModel(AccessToken) private readonly accessToken: typeof AccessToken
  ) {}

  async getAccessTokenByUserId(userId: number): Promise<AccessToken | null> {
    return await this.accessToken.findOne({
      where: {
        userId,
      },
      raw: true,
    });
  }
}
