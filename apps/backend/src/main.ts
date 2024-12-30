/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import v8 from 'v8';

import { logger } from './logger';
import { AppModule } from './app/app.module';

const totalHeapSize = v8.getHeapStatistics().total_available_size;
const totalSizeInGB = (totalHeapSize / 1024 / 1024 / 1024).toFixed(2);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      instance: logger,
    }),
  });
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.useGlobalPipes(new ValidationPipe());

  app.enableCors();

  const port = process.env['PORT'] || 1808;
  await app.listen(port);

  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}, total HEAP: ${totalSizeInGB}GB`
  );
}

bootstrap();
