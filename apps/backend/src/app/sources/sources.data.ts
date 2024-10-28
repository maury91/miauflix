import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  Source,
  SourceCreationAttributes,
} from '../database/entities/source.entity';

@Injectable()
export class SourceData {
  constructor(
    @InjectModel(Source) private readonly sourceModel: typeof Source
  ) {}

  async createSource(source: SourceCreationAttributes): Promise<Source> {
    return this.sourceModel.create(source);
  }
}
