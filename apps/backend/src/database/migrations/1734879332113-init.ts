import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1734879332113 implements MigrationInterface {
    name = 'Init1734879332113'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "episode_source" (
                "id" SERIAL NOT NULL,
                "episodeId" integer NOT NULL,
                "showSlug" character varying NOT NULL,
                "rejected" boolean NOT NULL DEFAULT false,
                "seasonNum" smallint NOT NULL,
                "episodeNum" smallint NOT NULL,
                "originalSource" character varying NOT NULL,
                "videos" character varying(500) array NOT NULL,
                "size" bigint NOT NULL,
                "data" bytea,
                "quality" smallint NOT NULL,
                "codec" character varying(20) NOT NULL,
                "source" character varying(20) NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_91d92391ef2986f2ede348eb391" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "episode" (
                "id" SERIAL NOT NULL,
                "showId" integer NOT NULL,
                "seasonId" integer NOT NULL,
                "number" smallint NOT NULL,
                "order" smallint,
                "title" character varying NOT NULL,
                "overview" text,
                "rating" numeric(4, 2) NOT NULL,
                "firstAired" TIMESTAMP,
                "runtime" smallint NOT NULL,
                "episodeType" character varying(30) NOT NULL,
                "image" character varying NOT NULL,
                "traktId" integer NOT NULL,
                "imdbId" character varying,
                "tvdbId" integer,
                "tmdbId" integer,
                "sourceFound" boolean NOT NULL DEFAULT false,
                "sourcesSearched" boolean NOT NULL DEFAULT false,
                "noSourceFound" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_7258b95d6d2bf7f621845a0e143" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "season" (
                "id" SERIAL NOT NULL,
                "showId" integer NOT NULL,
                "number" integer NOT NULL,
                "title" character varying NOT NULL,
                "overview" text NOT NULL,
                "episodesCount" integer NOT NULL,
                "airedEpisodes" integer NOT NULL,
                "rating" numeric(4, 2) NOT NULL,
                "network" character varying NOT NULL,
                "traktId" integer NOT NULL,
                "tvdbId" integer,
                "tmdbId" integer,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_8ac0d081dbdb7ab02d166bcda9f" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "show" (
                "id" SERIAL NOT NULL,
                "slug" character varying NOT NULL,
                "title" character varying NOT NULL,
                "year" integer NOT NULL,
                "overview" text NOT NULL,
                "network" character varying NOT NULL,
                "status" character varying NOT NULL,
                "runtime" integer NOT NULL,
                "trailer" character varying(500) NOT NULL,
                "rating" numeric(4, 2) NOT NULL,
                "airedEpisodes" smallint NOT NULL,
                "traktId" integer NOT NULL,
                "imdbId" character varying,
                "tmdbId" integer,
                "tvdbId" integer,
                "poster" character varying NOT NULL,
                "backdrop" character varying NOT NULL,
                "backdrops" character varying array NOT NULL,
                "logos" character varying array NOT NULL,
                "genres" character varying array NOT NULL,
                "seasonsCount" smallint NOT NULL DEFAULT '0',
                "lastCheckedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "lastSeasonAirDate" TIMESTAMP,
                "lastEpisodeAirDate" TIMESTAMP,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_d0c5e7624a941a5b67c0897e11e" UNIQUE ("slug"),
                CONSTRAINT "PK_e9993c2777c1d0907e845fce4d1" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "movie" (
                "id" SERIAL NOT NULL,
                "slug" character varying NOT NULL,
                "title" character varying NOT NULL,
                "year" integer NOT NULL,
                "overview" text NOT NULL,
                "runtime" integer NOT NULL,
                "trailer" character varying(500) NOT NULL,
                "rating" numeric(4, 2) NOT NULL,
                "traktId" integer NOT NULL,
                "imdbId" character varying,
                "tmdbId" integer,
                "poster" character varying NOT NULL,
                "backdrop" character varying NOT NULL,
                "backdrops" character varying array NOT NULL,
                "logos" character varying array NOT NULL,
                "sourcesSearched" boolean NOT NULL DEFAULT false,
                "noSourceFound" boolean NOT NULL DEFAULT false,
                "sourceFound" boolean NOT NULL DEFAULT false,
                "genres" character varying array NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_454288774942b99d5127fb4173b" UNIQUE ("slug"),
                CONSTRAINT "PK_cb3bb4d61cf764dc035cbedd422" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "movie_source" (
                "id" SERIAL NOT NULL,
                "movieSlug" character varying NOT NULL,
                "movieId" integer NOT NULL,
                "originalSource" character varying NOT NULL,
                "videos" character varying(500) array NOT NULL,
                "size" bigint NOT NULL,
                "data" bytea NOT NULL,
                "quality" smallint NOT NULL,
                "codec" character varying NOT NULL,
                "source" character varying NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c1cbcb99f9998e297f50b727f99" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "indexer" (
                "id" SERIAL NOT NULL,
                "configured" boolean NOT NULL,
                "title" character varying NOT NULL,
                "description" character varying NOT NULL,
                "language" character varying NOT NULL,
                "isPrivate" boolean NOT NULL,
                "defaultLimit" integer NOT NULL,
                "maxLimit" integer NOT NULL,
                "searchAvailable" boolean NOT NULL,
                "searchSupportedParams" character varying array NOT NULL,
                "tvSearchAvailable" boolean NOT NULL,
                "tvSearchSupportedParams" character varying array NOT NULL,
                "movieSearchAvailable" boolean NOT NULL,
                "movieSearchSupportedParams" character varying array NOT NULL,
                "tvCategories" smallint array NOT NULL,
                "movieCategories" smallint array NOT NULL,
                "animeCategories" smallint array NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c4c8947d39912d44325b5233e84" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "indexer_category" (
                "id" SERIAL NOT NULL,
                "name" character varying NOT NULL,
                "catId" integer NOT NULL,
                "indexerId" integer NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "parentCategoryId" integer,
                CONSTRAINT "PK_106d91251a284e146cabd13dc1d" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "torrent" (
                "id" SERIAL NOT NULL,
                "movieId" integer,
                "showId" integer,
                "seasonId" integer,
                "episodeId" integer,
                "seasonNum" integer,
                "episodeNum" integer,
                "runtime" integer NOT NULL,
                "mediaSlug" character varying NOT NULL,
                "title" character varying NOT NULL,
                "uuid" character varying NOT NULL,
                "pubDate" TIMESTAMP NOT NULL,
                "size" bigint NOT NULL,
                "url" text NOT NULL,
                "urlType" character varying NOT NULL,
                "tracker" character varying NOT NULL,
                "seeders" integer NOT NULL,
                "peers" integer NOT NULL,
                "quality" smallint NOT NULL,
                "codec" character varying NOT NULL,
                "source" character varying NOT NULL,
                "processed" boolean NOT NULL DEFAULT false,
                "rejected" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_07dc6d02eba775af11ce1c4f3e5" UNIQUE ("uuid"),
                CONSTRAINT "PK_a3cc65f26956bdde3fd43939028" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "user" (
                "id" SERIAL NOT NULL,
                "name" character varying NOT NULL,
                "slug" character varying NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_ac08b39ccb744ea6682c0db1c2d" UNIQUE ("slug"),
                CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "access_token" (
                "id" SERIAL NOT NULL,
                "accessToken" character varying NOT NULL,
                "refreshToken" character varying NOT NULL,
                "deviceCode" character varying NOT NULL,
                "tokenType" character varying(20) NOT NULL,
                "scope" character varying(20) NOT NULL,
                "expiresIn" integer NOT NULL,
                "userId" integer NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_f20f028607b2603deabd8182d12" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "episode_source"
            ADD CONSTRAINT "FK_4e366273e34407f9b969b4d9417" FOREIGN KEY ("episodeId") REFERENCES "episode"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "episode"
            ADD CONSTRAINT "FK_0c1ea384c602fb1c21e1a56de23" FOREIGN KEY ("showId") REFERENCES "show"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "episode"
            ADD CONSTRAINT "FK_e73d28c1e5e3c85125163f7c9cd" FOREIGN KEY ("seasonId") REFERENCES "season"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "season"
            ADD CONSTRAINT "FK_1addcb12701996373de04873742" FOREIGN KEY ("showId") REFERENCES "show"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "movie_source"
            ADD CONSTRAINT "FK_5e7aa4cbbf483add26ded0e1204" FOREIGN KEY ("movieId") REFERENCES "movie"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "indexer_category"
            ADD CONSTRAINT "FK_9034aad22ada17eabb6a1faef11" FOREIGN KEY ("parentCategoryId") REFERENCES "indexer_category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "indexer_category"
            ADD CONSTRAINT "FK_ca7c94511d024850a09e5a96c16" FOREIGN KEY ("indexerId") REFERENCES "indexer"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "access_token"
            ADD CONSTRAINT "FK_9949557d0e1b2c19e5344c171e9" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "access_token" DROP CONSTRAINT "FK_9949557d0e1b2c19e5344c171e9"
        `);
        await queryRunner.query(`
            ALTER TABLE "indexer_category" DROP CONSTRAINT "FK_ca7c94511d024850a09e5a96c16"
        `);
        await queryRunner.query(`
            ALTER TABLE "indexer_category" DROP CONSTRAINT "FK_9034aad22ada17eabb6a1faef11"
        `);
        await queryRunner.query(`
            ALTER TABLE "movie_source" DROP CONSTRAINT "FK_5e7aa4cbbf483add26ded0e1204"
        `);
        await queryRunner.query(`
            ALTER TABLE "season" DROP CONSTRAINT "FK_1addcb12701996373de04873742"
        `);
        await queryRunner.query(`
            ALTER TABLE "episode" DROP CONSTRAINT "FK_e73d28c1e5e3c85125163f7c9cd"
        `);
        await queryRunner.query(`
            ALTER TABLE "episode" DROP CONSTRAINT "FK_0c1ea384c602fb1c21e1a56de23"
        `);
        await queryRunner.query(`
            ALTER TABLE "episode_source" DROP CONSTRAINT "FK_4e366273e34407f9b969b4d9417"
        `);
        await queryRunner.query(`
            DROP TABLE "access_token"
        `);
        await queryRunner.query(`
            DROP TABLE "user"
        `);
        await queryRunner.query(`
            DROP TABLE "torrent"
        `);
        await queryRunner.query(`
            DROP TABLE "indexer_category"
        `);
        await queryRunner.query(`
            DROP TABLE "indexer"
        `);
        await queryRunner.query(`
            DROP TABLE "movie_source"
        `);
        await queryRunner.query(`
            DROP TABLE "movie"
        `);
        await queryRunner.query(`
            DROP TABLE "show"
        `);
        await queryRunner.query(`
            DROP TABLE "season"
        `);
        await queryRunner.query(`
            DROP TABLE "episode"
        `);
        await queryRunner.query(`
            DROP TABLE "episode_source"
        `);
    }

}
