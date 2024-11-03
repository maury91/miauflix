import { Module } from '@nestjs/common';
import { JackettController } from './jackett.controller';
import { HttpModule } from '@nestjs/axios';
import { JackettService } from './jackett.service';
import { JackettProcessor } from './jackett.processor';

@Module({
  imports: [HttpModule],
  controllers: [JackettController],
  providers: [JackettService, JackettProcessor],
  exports: [],
})
export class JackettModule {}
