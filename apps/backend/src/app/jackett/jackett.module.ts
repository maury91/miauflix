import { Module } from '@nestjs/common';
import { JackettController } from './jackett.controller';
import { HttpModule } from '@nestjs/axios';
import { JackettService } from './jackett.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { Torrent } from '../database/entities/torrent.entity';
import { BullModule } from '@nestjs/bullmq';
import { queues } from '../../queues';
import { JackettProcessor } from './jackett.processor';
import { MoviesData } from '../movies/movies.data';
import { Movie } from '../database/entities/movie.entity';
import { TorrentData } from '../torrent/torrent.data';
import { Source } from '../database/entities/source.entity';

@Module({
  imports: [
    BullModule.registerQueue({
      name: queues.torrentOrchestrator,
      defaultJobOptions: {
        removeOnComplete: true,
      },
    }),
    HttpModule,
    SequelizeModule.forFeature([Torrent, Movie, Source]),
  ],
  controllers: [JackettController],
  providers: [JackettService, TorrentData, MoviesData, JackettProcessor],
  exports: [SequelizeModule],
})
export class JackettModule {}
