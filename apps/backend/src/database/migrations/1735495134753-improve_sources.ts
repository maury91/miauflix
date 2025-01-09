import { MigrationInterface, QueryRunner } from "typeorm";

export class ImproveSources1735495134753 implements MigrationInterface {
    name = 'ImproveSources1735495134753'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."season_source_status_enum" AS ENUM('created', 'downloading', 'completed')
        `);
        await queryRunner.query(`
            CREATE TABLE "season_source" (
                "id" SERIAL NOT NULL,
                "seasonId" integer NOT NULL,
                "showSlug" character varying NOT NULL,
                "rejected" boolean NOT NULL DEFAULT false,
                "originalSource" character varying NOT NULL,
                "videos" character varying(500) array NOT NULL,
                "size" bigint NOT NULL,
                "data" bytea,
                "downloaded" bytea,
                "downloadPercentage" numeric(4, 1) NOT NULL DEFAULT '0',
                "downloadedPath" character varying,
                "status" "public"."season_source_status_enum" NOT NULL DEFAULT 'created',
                "lastUsedAt" TIMESTAMP,
                "quality" smallint NOT NULL,
                "availability" integer NOT NULL DEFAULT '0',
                "codec" character varying(20) NOT NULL,
                "source" character varying(20) NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_485e4a825c6b6ceed47adb7ccfd" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "show"
            ADD "initialSearchDone" boolean NOT NULL DEFAULT false
        `);
        await queryRunner.query(`
            ALTER TABLE "season_source"
            ADD CONSTRAINT "FK_e2cf8b7ba236ce27313b6a6dc4e" FOREIGN KEY ("seasonId") REFERENCES "season"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "season_source" DROP CONSTRAINT "FK_e2cf8b7ba236ce27313b6a6dc4e"
        `);
        await queryRunner.query(`
            ALTER TABLE "show" DROP COLUMN "initialSearchDone"
        `);
        await queryRunner.query(`
            DROP TABLE "season_source"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."season_source_status_enum"
        `);
    }

}
