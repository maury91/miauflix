import { Global, Injectable, Module } from '@nestjs/common';
import { InjectModel, SequelizeModule } from '@nestjs/sequelize';
import {
  Source,
  SourceCreationAttributes,
} from '../database/entities/source.entity';
import { Movie } from '../database/entities/movie.entity';

@Injectable()
export class SourceData {
  constructor(
    @InjectModel(Source) private readonly sourceModel: typeof Source
  ) {}

  async createSource(source: SourceCreationAttributes): Promise<Source> {
    return this.sourceModel.create(source);
  }
}

@Global()
@Module({
  imports: [SequelizeModule.forFeature([Movie, Source])],
  providers: [SourceData],
  exports: [SourceData, SequelizeModule],
})
export class SourceDataModule {}
