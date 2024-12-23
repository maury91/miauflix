import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvailability1734899234493 implements MigrationInterface {
  name = 'AddAvailability1734899234493';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "episode_source"
            ADD "availability" int NOT NULL DEFAULT '0'
        `);
    await queryRunner.query(`
            ALTER TABLE "movie_source"
            ADD "availability" int NOT NULL DEFAULT '0'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "movie_source" DROP COLUMN "availability"
        `);
    await queryRunner.query(`
            ALTER TABLE "episode_source" DROP COLUMN "availability"
        `);
  }
}
