import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ShowsController } from './shows.controller';
import { ShowsProcessor } from './shows.processor';
import { ShowsService } from './shows.service';

@Module({
  imports: [HttpModule],
  controllers: [ShowsController],
  providers: [ShowsProcessor, ShowsService],
  exports: [],
})
export class ShowsModule {}
