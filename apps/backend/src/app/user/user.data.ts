import { Global, Injectable, Module } from '@nestjs/common';
import { AccessToken } from '../database/entities/accessToken.entity';
import { User, UserCreationAttributes } from '../database/entities/user.entity';
import { UserDto } from '@miauflix/types';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

@Injectable()
export class UserData {
  constructor(
    @InjectRepository(User) private readonly userModel: Repository<User>,
    @InjectRepository(AccessToken)
    private readonly accessTokenModel: Repository<AccessToken>
  ) {}

  async getAccessTokenByUserId(userId: number): Promise<AccessToken | null> {
    return await this.accessTokenModel.findOne({
      where: {
        userId,
      },
    });
  }

  public async createUser(user: UserCreationAttributes): Promise<User> {
    const maybeUser = await this.userModel.findOne({
      where: {
        slug: user.slug,
      },
    });
    if (maybeUser) {
      const existingToken = await this.accessTokenModel.find({
        where: {
          userId: maybeUser.id,
        },
      });
      if (existingToken.length > 1) {
        await this.accessTokenModel.delete({
          userId: maybeUser.id,
          id: Not(existingToken[0].id),
        });
      }
      if (existingToken.length) {
        await this.accessTokenModel.update(
          {
            userId: maybeUser.id,
          },
          {
            ...user.accessTokens[0],
          }
        );
      } else {
        await this.accessTokenModel.insert({
          ...user.accessTokens[0],
          userId: maybeUser.id,
        });
      }
      return await this.userModel.findOne({
        where: {
          slug: user.slug,
        },
        relations: {
          accessTokens: true,
        },
      });
    }
    return await this.userModel.save(user);
  }

  public async findUserByDeviceCode(deviceCode: string): Promise<User | null> {
    return await this.userModel.findOne({
      where: {
        accessTokens: {
          deviceCode,
        },
      },
      relations: ['accessTokens'],
    });
  }

  public async getUsers(): Promise<UserDto[]> {
    return await this.userModel.find({
      select: ['id', 'name', 'slug'],
    });
  }

  public async getUserAccessToken(userId: number) {
    const accessTokenData = await this.accessTokenModel.findOne({
      select: ['accessToken'],
      where: {
        userId,
      },
    });

    if (!accessTokenData) {
      throw new Error('User has no access token');
    }

    return accessTokenData.accessToken;
  }

  public async getExpiringTokens(): Promise<AccessToken[]> {
    const accessTokens = await this.accessTokenModel.find();
    return accessTokens.filter((accessToken) => {
      // If expires in less than 5 days
      return (
        accessToken.createdAt.getTime() + accessToken.expiresIn * 1000 <
        Date.now() + 1000 * 60 * 60 * 24 * 5
      );
    });
  }

  public async updateToken(token: AccessToken) {
    await this.accessTokenModel.update(token.id, token);
  }
}

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User, AccessToken])],
  providers: [UserData],
  exports: [UserData, TypeOrmModule],
})
export class UserDataModule {}
