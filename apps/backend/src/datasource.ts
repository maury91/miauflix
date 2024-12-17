import { DataSource } from 'typeorm';
import { join } from 'path';

export const connectionSource = new DataSource({
  type: 'postgres',
  host: process.env['POSTGRES_HOST'],
  port: parseInt(process.env['POSTGRES_PORT'], 10),
  username: process.env['POSTGRES_USER'],
  password: process.env['POSTGRES_PASS'],
  database: process.env['POSTGRES_DB'],
  logging: true,
  entities: [join(__dirname, './app/database/entities/*.entity.ts')],
  migrations: [join(__dirname, './app/database/migrations/*.ts')],
  synchronize: false,
  migrationsTableName: 'miauflix_migrations',
  migrationsRun: false,
})
