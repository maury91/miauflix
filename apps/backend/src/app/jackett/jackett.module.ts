import { Module } from '@nestjs/common';
import { JackettController } from './jackett.controller';
import { HttpModule } from '@nestjs/axios';
import { JackettService } from './jackett.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { Torrent } from '../database/entities/torrent.entity';
import { BullModule } from '@nestjs/bullmq';
import { queues } from '../../queues';
import { JackettData } from './jackett.data';
import { JackettProcessor } from './jackett.processor';
import { MoviesData } from '../movies/movies.data';
import { Movie } from '../database/entities/movie.entity';

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: queues.jackett,
        defaultJobOptions: {
          removeOnComplete: true,
        },
      },
      {
        name: queues.torrent,
        defaultJobOptions: {
          removeOnComplete: true,
        },
      }
    ),
    HttpModule,
    SequelizeModule.forFeature([Torrent, Movie]),
  ],
  controllers: [JackettController],
  providers: [JackettService, JackettData, MoviesData, JackettProcessor],
  exports: [SequelizeModule],
})
export class JackettModule {}
