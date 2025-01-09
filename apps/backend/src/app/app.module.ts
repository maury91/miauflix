import { Keyv } from 'keyv';
import KeyvRedis from '@keyv/redis';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { ScheduleModule } from '@nestjs/schedule';
import { UserModule } from './user/user.module';
import { CacheModule } from '@nestjs/cache-manager';
import { MoviesModule } from './movies/movies.module';
import { JackettModule } from './jackett/jackett.module';
import { TorrentModule } from './torrent/torrent.module';
import { CategoriesModule } from './categories/categories.module';
import { ListsModule } from './lists/lists.module';
import { TraktModule } from './trakt/trakt.module';
import { JackettQueuesModule } from './jackett/jackett.queues';
import { MoviesQueuesModule } from './movies/movies.queues';
import { TorrentOrchestratorQueuesModule } from './torrent/torrent.orchestrator.queues';
import { TorrentQueuesModule } from './torrent/torrent.queues';
import { MoviesDataModule } from './movies/movies.data';
import { TorrentDataModule } from './torrent/torrent.data';
import { SourceDataModule } from './sources/sources.data';
import { UserDataModule } from './user/user.data';
import { TMDBApiModule } from './tmdb/tmdb.api';
import { ShowsDataModule } from './shows/shows.data';
import { TraktApiModule } from './trakt/trakt.api';
import { ShowsQueuesModule } from './shows/shows.queues';
import { ShowsModule } from './shows/shows.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { initializeDatabase } from '../datasource';
import { TrackersServiceModule } from './trackers/trackers.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: `${__dirname}/.env`,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        defaultJobOptions: {
          removeOnComplete: true,
        },
        connection: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
        },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forRootAsync({
      useFactory: initializeDatabase,
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        stores: [
          new Keyv({
            store: new KeyvRedis({
              socket: {
                host: configService.get<string>('REDIS_HOST'),
                port: configService.get<number>('REDIS_PORT'),
              },
            }),
          }),
        ],
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    HealthModule,
    AuthModule,
    UserModule,
    MoviesModule,
    JackettModule,
    TorrentModule,
    CategoriesModule,
    ListsModule,
    TraktModule,
    ShowsModule,
    TrackersServiceModule,
    // Queues
    JackettQueuesModule,
    MoviesQueuesModule,
    TorrentOrchestratorQueuesModule,
    TorrentQueuesModule,
    ShowsQueuesModule,
    // Data
    MoviesDataModule,
    SourceDataModule,
    TorrentDataModule,
    UserDataModule,
    ShowsDataModule,
    // APIs
    TMDBApiModule,
    // TVDBApiModule,
    TraktApiModule,
  ],
  controllers: [],
})
export class AppModule {}
