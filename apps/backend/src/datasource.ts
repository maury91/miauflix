import { DataSource, DataSourceOptions } from 'typeorm';
import { createDatabase } from 'typeorm-extension';
import { join } from 'path';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env['POSTGRES_HOST'],
  port: parseInt(process.env['POSTGRES_PORT'], 10),
  username: process.env['POSTGRES_USER'],
  password: process.env['POSTGRES_PASS'],
  database: process.env['POSTGRES_DB'],

  entities: [join(__dirname, './database/entities/*.entity.{ts,js}')],

  migrationsTableName: 'miauflix_migrations',
  migrations: [join(__dirname, './database/migrations/*.{ts,js}')],

  logging: ['error', 'migration'],
  // logger: 'file',
  // synchronize: false,
  migrationsRun: true,
};

export const initializeDatabase = async () => {
  await createDatabase({
    options: dataSourceOptions,
    initialDatabase: 'postgres',
    ifNotExist: true,
  });
  return dataSourceOptions;
};

export default new DataSource(dataSourceOptions);
