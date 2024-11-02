import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { UserDto } from '@miauflix/types';
import { User, UserCreationAttributes } from '../database/entities/user.entity';
import { AccessToken } from '../database/entities/accessToken.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User) private userModel: typeof User,
    @InjectModel(AccessToken) private accessTokenModel: typeof AccessToken
  ) {}

  public async createUser(user: UserCreationAttributes): Promise<User> {
    const maybeUser = await this.userModel.findOne({
      where: {
        slug: user.slug,
      },
    });
    if (maybeUser) {
      await this.accessTokenModel.create({
        ...user.accessTokens[0],
        userId: maybeUser.id,
      });
      return await this.userModel.findOne({
        where: {
          slug: user.slug,
        },
        include: [AccessToken],
      });
    }
    return this.userModel.create(user, {
      include: [AccessToken],
    });
  }

  public async findUserByDeviceCode(deviceCode: string): Promise<User | null> {
    return await this.userModel.findOne({
      include: [
        {
          model: AccessToken,
          where: {
            deviceCode: deviceCode,
          },
        },
      ],
      raw: true,
      nest: true,
    });
  }

  public async getUsers(): Promise<UserDto[]> {
    return (await this.userModel.findAll({
      attributes: ['id', 'name', 'slug'],
      raw: true,
    })) as UserDto[];
  }

  public async getUserAccessToken(userId: number) {
    const accessTokenData = await this.accessTokenModel.findOne({
      attributes: ['accessToken'],
      where: {
        userId,
      },
      raw: true,
    });

    if (!accessTokenData) {
      throw new Error('User has no access token');
    }

    return accessTokenData.accessToken;
  }

  public async getExpiringTokens(): Promise<AccessToken[]> {
    const accessTokens = await this.accessTokenModel.findAll();
    return accessTokens.filter(async (accessToken) => {
      // If expires in less than 5 days
      return (
        accessToken.createdAt.getTime() +
          accessToken.expiresIn * 1000 -
          Date.now() <
        1000 * 60 * 60 * 24 * 5
      );
    });
  }
}
