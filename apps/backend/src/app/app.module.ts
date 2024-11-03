import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { redisStore } from 'cache-manager-redis-store';

import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SequelizeModule } from '@nestjs/sequelize';
import { UserModule } from './user/user.module';
import { CacheModule, CacheStore } from '@nestjs/cache-manager';
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
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        dialect: 'postgres',
        host: configService.getOrThrow('POSTGRES_HOST'),
        port: configService.getOrThrow('POSTGRES_PORT'),
        username: configService.getOrThrow('POSTGRES_USER'),
        password: configService.getOrThrow('POSTGRES_PASS'),
        database: configService.getOrThrow('POSTGRES_DB'),
        autoLoadModels: true,
        synchronize: true,
        logging: false,
      }),
      inject: [ConfigService],
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const store = await redisStore({
          socket: {
            host: configService.get<string>('REDIS_HOST'),
            port: configService.get<number>('REDIS_PORT'),
          },
        });
        return {
          store: store as unknown as CacheStore,
        };
      },
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
    JackettQueuesModule,
    MoviesQueuesModule,
    TorrentOrchestratorQueuesModule,
    TorrentQueuesModule,
    MoviesDataModule,
    SourceDataModule,
    TorrentDataModule,
    UserDataModule,
  ],
  controllers: [],
})
export class AppModule {}
