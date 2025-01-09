import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProgress1735064191435 implements MigrationInterface {
  name = 'AddProgress1735064191435';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."episode_progress_status_enum" AS ENUM('watching', 'stopped', 'paused')
        `);
    await queryRunner.query(`
            CREATE TABLE "episode_progress" (
                "id" SERIAL NOT NULL,
                "episodeId" integer NOT NULL,
                "userId" integer NOT NULL,
                "progress" smallint NOT NULL DEFAULT '0',
                "synced" boolean NOT NULL DEFAULT false,
                "traktId" integer NOT NULL,
                "status" "public"."episode_progress_status_enum" NOT NULL DEFAULT 'stopped',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_88ad187b831ed30209212e39a4a" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_6c9407c67fd3c8ff965843e7e4" ON "episode_progress" ("episodeId", "userId")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."movie_progress_status_enum" AS ENUM('watching', 'stopped', 'paused')
        `);
    await queryRunner.query(`
            CREATE TABLE "movie_progress" (
                "id" SERIAL NOT NULL,
                "movieId" integer NOT NULL,
                "userId" integer NOT NULL,
                "progress" integer NOT NULL DEFAULT '0',
                "synced" boolean NOT NULL DEFAULT false,
                "status" "public"."movie_progress_status_enum" NOT NULL DEFAULT 'stopped',
                "slug" character varying NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_0c079edd0d728edc1832a79667e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_7a5df76c49d6c33b65e76a05d0" ON "movie_progress" ("movieId", "userId")
        `);
    await queryRunner.query(`
            ALTER TABLE "movie_source"
            ADD "rejected" boolean NOT NULL DEFAULT false
        `);
    await queryRunner.query(`
            ALTER TABLE "episode"
            ADD "seasonNumber" integer
        `);
    await queryRunner.query(`
            UPDATE "episode"
            SET "seasonNumber" = "season"."number"
            FROM "season"
            WHERE "episode"."seasonId" = "season"."id"
    `);
    await queryRunner.query(`
            ALTER TABLE "episode"
            ALTER COLUMN "seasonNumber"
            SET NOT NULL
    `);
    await queryRunner.query(`
            ALTER TABLE "episode_progress"
            ADD CONSTRAINT "FK_b551371af8874f25763503cb283" FOREIGN KEY ("episodeId") REFERENCES "episode"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "episode_progress"
            ADD CONSTRAINT "FK_7f1cecafc83a463d2eaa6fcb952" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "movie_progress"
            ADD CONSTRAINT "FK_a7180c9eda1d9d5b54157a4faa8" FOREIGN KEY ("movieId") REFERENCES "movie"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "movie_progress"
            ADD CONSTRAINT "FK_e64b3d298dfe1427107417d8233" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "movie_progress" DROP CONSTRAINT "FK_e64b3d298dfe1427107417d8233"
        `);
    await queryRunner.query(`
            ALTER TABLE "movie_progress" DROP CONSTRAINT "FK_a7180c9eda1d9d5b54157a4faa8"
        `);
    await queryRunner.query(`
            ALTER TABLE "episode_progress" DROP CONSTRAINT "FK_7f1cecafc83a463d2eaa6fcb952"
        `);
    await queryRunner.query(`
            ALTER TABLE "episode_progress" DROP CONSTRAINT "FK_b551371af8874f25763503cb283"
        `);
    await queryRunner.query(`
            ALTER TABLE "episode" DROP COLUMN "progress"
        `);
    await queryRunner.query(`
            ALTER TABLE "episode" DROP COLUMN "seasonNumber"
        `);
    await queryRunner.query(`
            ALTER TABLE "movie_source" DROP COLUMN "rejected"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_7a5df76c49d6c33b65e76a05d0"
        `);
    await queryRunner.query(`
            DROP TABLE "movie_progress"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."movie_progress_status_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_6c9407c67fd3c8ff965843e7e4"
        `);
    await queryRunner.query(`
            DROP TABLE "episode_progress"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."episode_progress_status_enum"
        `);
  }
}
