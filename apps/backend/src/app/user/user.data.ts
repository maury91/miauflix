import { Global, Injectable, Module } from '@nestjs/common';
import { InjectModel, SequelizeModule } from '@nestjs/sequelize';
import { AccessToken } from '../database/entities/accessToken.entity';
import { User, UserCreationAttributes } from '../database/entities/user.entity';
import { UserDto } from '@miauflix/types';
import { Op } from 'sequelize';

@Injectable()
export class UserData {
  constructor(
    @InjectModel(User) private readonly userModel: typeof User,
    @InjectModel(AccessToken)
    private readonly accessTokenModel: typeof AccessToken
  ) {}

  async getAccessTokenByUserId(userId: number): Promise<AccessToken | null> {
    return await this.accessTokenModel.findOne({
      where: {
        userId,
      },
      raw: true,
    });
  }

  public async createUser(user: UserCreationAttributes): Promise<User> {
    const maybeUser = await this.userModel.findOne({
      where: {
        slug: user.slug,
      },
    });
    if (maybeUser) {
      console.log('User already exists, updating access token');
      const existingToken = await this.accessTokenModel.findAll({
        where: {
          userId: maybeUser.id,
        },
        raw: true,
      });
      if (existingToken.length > 1) {
        await this.accessTokenModel.destroy({
          where: {
            userId: maybeUser.id,
            id: {
              [Op.ne]: existingToken[0].id,
            },
          },
        });
      }
      if (existingToken.length) {
        await this.accessTokenModel.update(
          {
            ...user.accessTokens[0],
          },
          {
            where: {
              userId: maybeUser.id,
            },
          }
        );
      } else {
        await this.accessTokenModel.create({
          ...user.accessTokens[0],
          userId: maybeUser.id,
        });
      }
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
    return accessTokens.filter((accessToken) => {
      // If expires in less than 5 days
      return (
        accessToken.createdAt.getTime() + accessToken.expiresIn * 1000 <
        Date.now() + 1000 * 60 * 60 * 24 * 5
      );
    });
  }
}

@Global()
@Module({
  imports: [SequelizeModule.forFeature([User, AccessToken])],
  providers: [UserData],
  exports: [UserData, SequelizeModule],
})
export class UserDataModule {}
