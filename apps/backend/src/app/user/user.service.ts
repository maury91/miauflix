import { Injectable } from '@nestjs/common';
import { UserDto } from '@miauflix/types';
import { UserData } from './user.data';

@Injectable()
export class UserService {
  constructor(private readonly userData: UserData) {}

  public getUsers(): Promise<UserDto[]> {
    return this.userData.getUsers();
  }
}
