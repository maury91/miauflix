import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStorage1735072748779 implements MigrationInterface {
    name = 'AddStorage1735072748779'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "episode_source"
            ADD "downloaded" bytea
        `);
        await queryRunner.query(`
            ALTER TABLE "episode_source"
            ADD "downloadPercentage" numeric(4, 1) NOT NULL DEFAULT '0'
        `);
        await queryRunner.query(`
            ALTER TABLE "episode_source"
            ADD "downloadedPath" character varying
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."episode_source_status_enum" AS ENUM('created', 'downloading', 'completed')
        `);
        await queryRunner.query(`
            ALTER TABLE "episode_source"
            ADD "status" "public"."episode_source_status_enum" NOT NULL DEFAULT 'created'
        `);
        await queryRunner.query(`
            ALTER TABLE "episode_source"
            ADD "lastUsedAt" TIMESTAMP
        `);
        await queryRunner.query(`
            ALTER TABLE "movie_source"
            ADD "downloaded" bytea
        `);
        await queryRunner.query(`
            ALTER TABLE "movie_source"
            ADD "downloadPercentage" numeric(4, 1) NOT NULL DEFAULT '0'
        `);
        await queryRunner.query(`
            ALTER TABLE "movie_source"
            ADD "downloadedPath" character varying
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."movie_source_status_enum" AS ENUM('created', 'downloading', 'completed')
        `);
        await queryRunner.query(`
            ALTER TABLE "movie_source"
            ADD "status" "public"."movie_source_status_enum" NOT NULL DEFAULT 'created'
        `);
        await queryRunner.query(`
            ALTER TABLE "movie_source"
            ADD "lastUsedAt" TIMESTAMP
        `);
        await queryRunner.query(`
            ALTER TABLE "movie"
            ALTER COLUMN "trailer" DROP NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "show"
            ALTER COLUMN "trailer" DROP NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "show"
            ALTER COLUMN "rating" DROP NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "show"
            ALTER COLUMN "airedEpisodes"
            SET DEFAULT '0'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "show"
            ALTER COLUMN "airedEpisodes" DROP DEFAULT
        `);
        await queryRunner.query(`
            ALTER TABLE "show"
            ALTER COLUMN "rating"
            SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "show"
            ALTER COLUMN "trailer"
            SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "movie"
            ALTER COLUMN "trailer"
            SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "movie_source" DROP COLUMN "lastUsedAt"
        `);
        await queryRunner.query(`
            ALTER TABLE "movie_source" DROP COLUMN "status"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."movie_source_status_enum"
        `);
        await queryRunner.query(`
            ALTER TABLE "movie_source" DROP COLUMN "downloadedPath"
        `);
        await queryRunner.query(`
            ALTER TABLE "movie_source" DROP COLUMN "downloadPercentage"
        `);
        await queryRunner.query(`
            ALTER TABLE "movie_source" DROP COLUMN "downloaded"
        `);
        await queryRunner.query(`
            ALTER TABLE "episode_source" DROP COLUMN "lastUsedAt"
        `);
        await queryRunner.query(`
            ALTER TABLE "episode_source" DROP COLUMN "status"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."episode_source_status_enum"
        `);
        await queryRunner.query(`
            ALTER TABLE "episode_source" DROP COLUMN "downloadedPath"
        `);
        await queryRunner.query(`
            ALTER TABLE "episode_source" DROP COLUMN "downloadPercentage"
        `);
        await queryRunner.query(`
            ALTER TABLE "episode_source" DROP COLUMN "downloaded"
        `);
    }

}
