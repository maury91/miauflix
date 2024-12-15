require('dotenv').config();

module.exports = {
  development: {
    username: process.env['POSTGRES_USER'],
    password: process.env['POSTGRES_PASS'],
    database: process.env['POSTGRES_DB'],
    host: process.env['POSTGRES_HOST'],
    port: parseInt(process.env['POSTGRES_PORT'], 10),
    dialect: 'postgres',
  }
}
