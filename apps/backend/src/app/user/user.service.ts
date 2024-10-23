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

  public getUsers(): Promise<UserDto[]> {
    return this.userModel.findAll({
      attributes: ['name', 'slug'],
      raw: true,
    });
  }
}
