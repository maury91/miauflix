import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Each profile's interface, audio and subtitle languages. Written by hand: the generator rebuilds
 * the users table, which other tables reference.
 */
export class AddLanguagePreferences1795286483967 implements MigrationInterface {
  name = 'AddLanguagePreferences1795286483967';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "languagePreferences" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "languagePreferences"`);
  }
}
