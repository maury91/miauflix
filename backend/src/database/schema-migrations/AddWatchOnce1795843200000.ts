import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Written by hand: the generator rebuilds tables that other tables reference. */
export class AddWatchOnce1795843200000 implements MigrationInterface {
  name = 'AddWatchOnce1795843200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "watchOnce" boolean NOT NULL DEFAULT (0)`
    );
    await queryRunner.query(
      `ALTER TABLE "playback_grant" ADD COLUMN "watchOnce" boolean NOT NULL DEFAULT (0)`
    );
    await queryRunner.query(
      `ALTER TABLE "playback_grant" ADD COLUMN "matchKind" varchar(16) NOT NULL DEFAULT ('single')`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "playback_grant" DROP COLUMN "matchKind"`);
    await queryRunner.query(`ALTER TABLE "playback_grant" DROP COLUMN "watchOnce"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "watchOnce"`);
  }
}
