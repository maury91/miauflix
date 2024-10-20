import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from '../database/entities/user.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { AccessToken } from '../database/entities/accessToken.entity';

@Module({
  imports: [SequelizeModule.forFeature([User, AccessToken])],
  controllers: [UserController],
  providers: [UserService],
  exports: [SequelizeModule],
})
export class UserModule {}
