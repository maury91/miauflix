import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaVariant1794649236030 implements MigrationInterface {
  name = 'AddMediaVariant1794649236030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "media_variant" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "sourceId" integer NOT NULL, "k" text NOT NULL, "kind" varchar NOT NULL, "state" varchar NOT NULL, "container" varchar, "videoCodec" varchar, "audioCodecs" text NOT NULL, "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c23d334a0b55c0e706cc4048f4" ON "media_variant" ("sourceId", "k", "kind") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_c23d334a0b55c0e706cc4048f4"`);
    await queryRunner.query(`DROP TABLE "media_variant"`);
  }
}
