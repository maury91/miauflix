import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Baseline1794506434316 implements MigrationInterface {
  name = 'Baseline1794506434316';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" varchar PRIMARY KEY NOT NULL, "eventType" varchar CHECK( "eventType" IN ('LOGIN','LOGOUT','LOGIN_FAILURE','PASSWORD_CHANGE','PASSWORD_RESET_REQUEST','PASSWORD_RESET_COMPLETE','TOKEN_REFRESH','TOKEN_INVALIDATION','UNAUTHORIZED_ACCESS','USER_CREATION','USER_UPDATE','USER_DELETION','ROLE_CHANGE','API_ACCESS','API_ERROR','CONFIGURATION_CHANGE','SECURITY_SETTING_CHANGE','SUSPICIOUS_ACTIVITY','RATE_LIMIT_EXCEEDED','IP_BLOCKED','IP_UNBLOCKED','OTHER') ) NOT NULL, "severity" varchar CHECK( "severity" IN ('INFO','WARNING','ERROR','CRITICAL') ) NOT NULL DEFAULT ('INFO'), "description" varchar(500), "ipAddress" varchar(50), "userAgent" varchar, "metadata" json, "userEmail" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_createdAt" ON "audit_logs" ("createdAt") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_eventType_createdAt" ON "audit_logs" ("eventType", "createdAt") `
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" varchar PRIMARY KEY NOT NULL, "tokenHash" varchar(64) NOT NULL, "previousTokenHash" varchar(64), "rotatedAt" datetime, "expiresAt" datetime NOT NULL, "userId" varchar NOT NULL, "session" varchar(64) NOT NULL, "userAgent" varchar(500), "lastIpAddress" varchar(45), "lastAccessedAt" datetime NOT NULL, "accessCount" integer NOT NULL DEFAULT (1), "issueIpAddress" varchar(45), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c25bc63d248ca90e8dcc1d92d0" ON "refresh_tokens" ("tokenHash") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_610102b60fea1455310ccd299d" ON "refresh_tokens" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_927e2df7f4574d1989e9db0518" ON "refresh_tokens" ("session") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5025049479f0f298e6a2e7642a" ON "refresh_tokens" ("userId", "session") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_56b91d98f71e3d1b649ed6e9f3" ON "refresh_tokens" ("expiresAt") `
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" varchar PRIMARY KEY NOT NULL, "email" varchar NOT NULL, "passwordHash" varchar NOT NULL, "role" varchar CHECK( "role" IN ('user','admin') ) NOT NULL DEFAULT ('user'), "isEmailVerified" boolean NOT NULL DEFAULT (0), "displayName" varchar(255), "avatar" text, "avatarRenderedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"))`
    );
    await queryRunner.query(
      `CREATE TABLE "availability_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" varchar NOT NULL, "k" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_9c7ecdb86bef971fd0f266f9e2f" UNIQUE ("userId", "k"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_532f60aac0560dcfbb5d5fb25e" ON "availability_request" ("k") `
    );
    await queryRunner.query(
      `CREATE TABLE "background_job" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "type" varchar NOT NULL, "dedupeKey" varchar NOT NULL, "payload" text NOT NULL, "status" varchar NOT NULL DEFAULT ('pending'), "attempts" integer NOT NULL DEFAULT (0), "maxAttempts" integer NOT NULL DEFAULT (5), "priority" integer NOT NULL DEFAULT (0), "runAfter" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "leaseUntil" datetime, "leaseOwner" varchar, "lastError" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eae90ac91b98b90c1b9798f838" ON "background_job" ("status", "priority", "runAfter") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2729a2b728ede1d2f0fd316ad5" ON "background_job" ("status", "runAfter", "leaseUntil") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_490481070ae3af85b32066e597" ON "background_job" ("type", "dedupeKey") WHERE "status" != 'dead'`
    );
    await queryRunner.query(
      `CREATE TABLE "content_source" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "ih" varchar(92) NOT NULL, "ml" varchar NOT NULL, "u" text, "quality" integer, "size" integer NOT NULL, "videoCodec" integer, "languages" varchar(160), "broadcasters" integer, "watchers" integer, "source" varchar NOT NULL, "sourceType" integer, "file" blob, "hasVideo" boolean, "pd" text, "sourceUploadedAt" datetime, "streamingScore" integer NOT NULL DEFAULT (0), "lastStatsCheck" datetime, "nextStatsCheckAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_1051f08942095ee3b03dbfcdd2f" UNIQUE ("ih"))`
    );
    await queryRunner.query(
      `CREATE TABLE "tv_show" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tmdbId" integer NOT NULL, "name" varchar NOT NULL, "overview" text NOT NULL, "firstAirDate" varchar NOT NULL, "poster" varchar NOT NULL, "backdrop" varchar NOT NULL, "imdbId" varchar, "status" varchar NOT NULL, "episodeRuntime" integer, "popularity" float NOT NULL DEFAULT (0), "rating" float NOT NULL DEFAULT (0), "watching" boolean NOT NULL DEFAULT (0), "seasonLayoutVersion" varchar(32), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_116f9643ed78cd2eda697e9d4ad" UNIQUE ("tmdbId"))`
    );
    await queryRunner.query(
      `CREATE TABLE "season" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tmdbId" integer NOT NULL, "tvShowId" integer NOT NULL, "seasonNumber" integer NOT NULL, "name" varchar NOT NULL, "overview" varchar NOT NULL, "airDate" varchar, "posterPath" varchar, "synced" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_b7fb194fd71ecf6ada1a4feea6a" UNIQUE ("tvShowId", "seasonNumber"))`
    );
    await queryRunner.query(
      `CREATE TABLE "episode" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tmdbId" integer NOT NULL, "seasonId" integer NOT NULL, "episodeNumber" integer NOT NULL, "name" varchar NOT NULL, "overview" varchar NOT NULL, "airDate" varchar(50), "stillPath" varchar NOT NULL, "imdbId" varchar NOT NULL, "providerSeasonNumber" integer, "providerEpisodeNumber" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_619ebf32ab6d66ecab8cc9ba7b3" UNIQUE ("seasonId", "episodeNumber"))`
    );
    await queryRunner.query(
      `CREATE TABLE "episode_source" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "episodeId" integer NOT NULL, "sourceId" integer NOT NULL, "k" text, "matchKind" varchar(16) NOT NULL DEFAULT ('single'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_372b06b20e884eee7cab1247d7f" UNIQUE ("episodeId", "sourceId", "k"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_962d51ff0dc5ddaf3744619dd2" ON "episode_source" ("episodeId", "sourceId") `
    );
    await queryRunner.query(
      `CREATE TABLE "media_list" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "slug" varchar NOT NULL, "ownerKey" varchar NOT NULL DEFAULT ('public'), "remoteListId" varchar, "description" varchar, "provider" varchar NOT NULL DEFAULT ('trakt'), "activeGeneration" varchar, "lastSyncedAt" datetime)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d5630bb68006fc178c98fa3f92" ON "media_list" ("ownerKey", "slug") `
    );
    await queryRunner.query(
      `CREATE TABLE "media_list_item" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "listId" integer NOT NULL, "generation" varchar NOT NULL, "position" integer NOT NULL, "mediaType" varchar NOT NULL, "tmdbId" integer NOT NULL)`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9fe12e06e8039792a1a808a536" ON "media_list_item" ("listId", "generation", "mediaType", "tmdbId") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a9e2567f3c0cbd174f4b1eaf68" ON "media_list_item" ("listId", "generation", "position") `
    );
    await queryRunner.query(
      `CREATE TABLE "media_probe" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "sourceId" integer NOT NULL, "k" text NOT NULL, "v" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b5ff96d400619d86b800eccafc" ON "media_probe" ("sourceId", "k") `
    );
    await queryRunner.query(
      `CREATE TABLE "media_ratings" ("userId" varchar NOT NULL, "mediaType" varchar NOT NULL, "mediaId" integer NOT NULL, "rating" varchar NOT NULL, PRIMARY KEY ("userId", "mediaType", "mediaId"))`
    );
    await queryRunner.query(
      `CREATE TABLE "migration_version" ("id" integer PRIMARY KEY NOT NULL, "version" integer NOT NULL DEFAULT (0), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `CREATE TABLE "movie" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tmdbId" integer NOT NULL, "imdbId" varchar(11), "title" varchar NOT NULL, "overview" text NOT NULL, "runtime" integer NOT NULL, "trailer" varchar(500), "rating" decimal(4,2) NOT NULL DEFAULT (0), "popularity" float NOT NULL DEFAULT (0), "releaseDate" varchar NOT NULL, "poster" varchar NOT NULL, "backdrop" varchar NOT NULL, "contentDirectoriesSearched" text NOT NULL DEFAULT ('[]'), "sourceSearchComplete" boolean NOT NULL DEFAULT (0), "nextSourceSearchAt" datetime DEFAULT (CURRENT_TIMESTAMP), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_e67ea82f6973f5b9a6747fba346" UNIQUE ("tmdbId"), CONSTRAINT "UQ_1cf786a188444119c21d86e00b5" UNIQUE ("imdbId"))`
    );
    await queryRunner.query(
      `CREATE TABLE "movie_source" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "movieId" integer NOT NULL, "sourceId" integer NOT NULL, "k" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_ca1fae3f648c0f14ca7f3aa2074" UNIQUE ("movieId", "sourceId"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e7aa4cbbf483add26ded0e120" ON "movie_source" ("movieId") `
    );
    await queryRunner.query(
      `CREATE TABLE "notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" varchar NOT NULL, "dedupeKey" varchar(40) NOT NULL, "type" varchar(40) NOT NULL, "mediaType" varchar(8) NOT NULL, "mediaId" integer NOT NULL, "a" varchar NOT NULL, "b" varchar NOT NULL, "seasonNumber" integer, "episodeNumber" integer, "quality" varchar(8), "sourceType" varchar(8), "previousSourceType" varchar(8), "readAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_f260e755ecee379407534d15ae6" UNIQUE ("userId", "dedupeKey"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b142beadffd32dfe9c1afc1c28" ON "notification" ("userId", "readAt") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_039c7fcba309434f48b3ffaa58" ON "notification" ("userId", "createdAt") `
    );
    await queryRunner.query(
      `CREATE TABLE "playback_grant" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "keyHash" varchar(64) NOT NULL, "userId" varchar NOT NULL, "sourceId" integer NOT NULL, "playableKind" varchar(16) NOT NULL, "playableKey" varchar(128) NOT NULL, "expiresAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_1c6a0d6f4f8920481ce39a460f9" UNIQUE ("keyHash"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8887f18325ba6d988fc29335a8" ON "playback_grant" ("userId", "playableKey") `
    );
    await queryRunner.query(
      `CREATE TABLE "progress" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" varchar NOT NULL, "playableKind" varchar(16) NOT NULL, "playableKey" varchar(128) NOT NULL, "positionSeconds" float NOT NULL, "durationSeconds" float NOT NULL, "state" varchar(16) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_b00158fdd5eb17d9593d1b7d025" UNIQUE ("userId", "playableKey"))`
    );
    await queryRunner.query(
      `CREATE INDEX "idx_progress_user_updated" ON "progress" ("userId", "updatedAt") `
    );
    await queryRunner.query(
      `CREATE TABLE "qr_login_requests" ("id" varchar PRIMARY KEY NOT NULL, "approvalTokenHash" varchar(64) NOT NULL, "claimTokenHash" varchar(64) NOT NULL, "state" varchar NOT NULL, "approvedUserId" varchar, "userAgent" varchar(500), "ipAddress" varchar(45), "expiresAt" datetime NOT NULL, "approvedAt" datetime, "claimedAt" datetime, "claimLease" varchar(64), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1f5171c1f14b3394a53f1477bf" ON "qr_login_requests" ("expiresAt") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4fa4f17bcf674bc0f7d79d5fa4" ON "qr_login_requests" ("claimTokenHash") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e2d710efa885a5cfff9273e714" ON "qr_login_requests" ("approvalTokenHash") `
    );
    await queryRunner.query(
      `CREATE TABLE "recent_searches" ("userId" varchar NOT NULL, "kind" varchar NOT NULL, "k" varchar NOT NULL, "v" varchar NOT NULL, "searchedAt" datetime NOT NULL, PRIMARY KEY ("userId", "kind", "k"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e96eb17b26e1367d7c82e45e63" ON "recent_searches" ("userId", "searchedAt") `
    );
    await queryRunner.query(
      `CREATE TABLE "storage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "sourceId" integer NOT NULL, "downloadedPieces" blob NOT NULL, "size" integer NOT NULL, "logicalBytes" integer NOT NULL DEFAULT (0), "verifiedBytes" integer NOT NULL DEFAULT (0), "allocatedBytes" integer NOT NULL DEFAULT (0), "reservedBytes" integer NOT NULL DEFAULT (0), "totalPieces" integer NOT NULL DEFAULT (0), "pieceLength" integer NOT NULL DEFAULT (0), "lastInterestAt" datetime, "videoCompletedAt" datetime, "localOnly" boolean NOT NULL DEFAULT (0), "encryptedLayout" text, "activeStreams" integer NOT NULL DEFAULT (0), "downloaded" integer NOT NULL DEFAULT (0), "location" varchar(500) NOT NULL, "lastAccessAt" datetime, "lastWriteAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "REL_1f4a8027c5369109ce59af8e2d" UNIQUE ("sourceId"))`
    );
    await queryRunner.query(
      `CREATE INDEX "idx_storage_last_access" ON "storage" ("lastAccessAt") `
    );
    await queryRunner.query(
      `CREATE TABLE "storage_file" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "storageId" integer NOT NULL, "k" text NOT NULL, "offset" integer NOT NULL, "length" integer NOT NULL, "completedAt" datetime, CONSTRAINT "UQ_0aecb2fc131af465289eac90c9a" UNIQUE ("storageId", "k"))`
    );
    await queryRunner.query(
      `CREATE TABLE "storage_file_claim" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "storageId" integer NOT NULL, "k" text NOT NULL, "kind" varchar(16) NOT NULL, "ownerKey" varchar(128) NOT NULL, "rangeStart" integer NOT NULL DEFAULT (0), "rangeEnd" integer, "expiresAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_d7301e1509794c733f7a191f932" UNIQUE ("storageId", "k", "kind", "ownerKey"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fb2010290cc1ece95011f701cc" ON "storage_file_claim" ("expiresAt") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_081de880576262b78b492f0eca" ON "storage_file_claim" ("storageId") `
    );
    await queryRunner.query(
      `CREATE TABLE "streaming_key" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "keyHash" varchar(60) NOT NULL, "movieId" integer NOT NULL, "userId" varchar NOT NULL, "expiresAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_ab5b8bf1f75debc4d39a44d18a6" UNIQUE ("keyHash"))`
    );
    await queryRunner.query(`DROP INDEX "IDX_c25bc63d248ca90e8dcc1d92d0"`);
    await queryRunner.query(`DROP INDEX "IDX_610102b60fea1455310ccd299d"`);
    await queryRunner.query(`DROP INDEX "IDX_927e2df7f4574d1989e9db0518"`);
    await queryRunner.query(`DROP INDEX "IDX_5025049479f0f298e6a2e7642a"`);
    await queryRunner.query(`DROP INDEX "IDX_56b91d98f71e3d1b649ed6e9f3"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_refresh_tokens" ("id" varchar PRIMARY KEY NOT NULL, "tokenHash" varchar(64) NOT NULL, "previousTokenHash" varchar(64), "rotatedAt" datetime, "expiresAt" datetime NOT NULL, "userId" varchar NOT NULL, "session" varchar(64) NOT NULL, "userAgent" varchar(500), "lastIpAddress" varchar(45), "lastAccessedAt" datetime NOT NULL, "accessCount" integer NOT NULL DEFAULT (1), "issueIpAddress" varchar(45), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_610102b60fea1455310ccd299de" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_refresh_tokens"("id", "tokenHash", "previousTokenHash", "rotatedAt", "expiresAt", "userId", "session", "userAgent", "lastIpAddress", "lastAccessedAt", "accessCount", "issueIpAddress", "createdAt", "updatedAt") SELECT "id", "tokenHash", "previousTokenHash", "rotatedAt", "expiresAt", "userId", "session", "userAgent", "lastIpAddress", "lastAccessedAt", "accessCount", "issueIpAddress", "createdAt", "updatedAt" FROM "refresh_tokens"`
    );
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`ALTER TABLE "temporary_refresh_tokens" RENAME TO "refresh_tokens"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c25bc63d248ca90e8dcc1d92d0" ON "refresh_tokens" ("tokenHash") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_610102b60fea1455310ccd299d" ON "refresh_tokens" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_927e2df7f4574d1989e9db0518" ON "refresh_tokens" ("session") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5025049479f0f298e6a2e7642a" ON "refresh_tokens" ("userId", "session") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_56b91d98f71e3d1b649ed6e9f3" ON "refresh_tokens" ("expiresAt") `
    );
    await queryRunner.query(`DROP INDEX "IDX_532f60aac0560dcfbb5d5fb25e"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_availability_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" varchar NOT NULL, "k" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_9c7ecdb86bef971fd0f266f9e2f" UNIQUE ("userId", "k"), CONSTRAINT "FK_4fc43e1efe4a142927be0e0ec53" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_availability_request"("id", "userId", "k", "createdAt") SELECT "id", "userId", "k", "createdAt" FROM "availability_request"`
    );
    await queryRunner.query(`DROP TABLE "availability_request"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_availability_request" RENAME TO "availability_request"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_532f60aac0560dcfbb5d5fb25e" ON "availability_request" ("k") `
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_season" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tmdbId" integer NOT NULL, "tvShowId" integer NOT NULL, "seasonNumber" integer NOT NULL, "name" varchar NOT NULL, "overview" varchar NOT NULL, "airDate" varchar, "posterPath" varchar, "synced" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_b7fb194fd71ecf6ada1a4feea6a" UNIQUE ("tvShowId", "seasonNumber"), CONSTRAINT "FK_5f1f02b5d67380020a61e9d3dcd" FOREIGN KEY ("tvShowId") REFERENCES "tv_show" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_season"("id", "tmdbId", "tvShowId", "seasonNumber", "name", "overview", "airDate", "posterPath", "synced", "createdAt", "updatedAt") SELECT "id", "tmdbId", "tvShowId", "seasonNumber", "name", "overview", "airDate", "posterPath", "synced", "createdAt", "updatedAt" FROM "season"`
    );
    await queryRunner.query(`DROP TABLE "season"`);
    await queryRunner.query(`ALTER TABLE "temporary_season" RENAME TO "season"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_episode" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tmdbId" integer NOT NULL, "seasonId" integer NOT NULL, "episodeNumber" integer NOT NULL, "name" varchar NOT NULL, "overview" varchar NOT NULL, "airDate" varchar(50), "stillPath" varchar NOT NULL, "imdbId" varchar NOT NULL, "providerSeasonNumber" integer, "providerEpisodeNumber" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_619ebf32ab6d66ecab8cc9ba7b3" UNIQUE ("seasonId", "episodeNumber"), CONSTRAINT "FK_e73d28c1e5e3c85125163f7c9cd" FOREIGN KEY ("seasonId") REFERENCES "season" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_episode"("id", "tmdbId", "seasonId", "episodeNumber", "name", "overview", "airDate", "stillPath", "imdbId", "providerSeasonNumber", "providerEpisodeNumber", "createdAt", "updatedAt") SELECT "id", "tmdbId", "seasonId", "episodeNumber", "name", "overview", "airDate", "stillPath", "imdbId", "providerSeasonNumber", "providerEpisodeNumber", "createdAt", "updatedAt" FROM "episode"`
    );
    await queryRunner.query(`DROP TABLE "episode"`);
    await queryRunner.query(`ALTER TABLE "temporary_episode" RENAME TO "episode"`);
    await queryRunner.query(`DROP INDEX "IDX_962d51ff0dc5ddaf3744619dd2"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_episode_source" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "episodeId" integer NOT NULL, "sourceId" integer NOT NULL, "k" text, "matchKind" varchar(16) NOT NULL DEFAULT ('single'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_372b06b20e884eee7cab1247d7f" UNIQUE ("episodeId", "sourceId", "k"), CONSTRAINT "FK_4e366273e34407f9b969b4d9417" FOREIGN KEY ("episodeId") REFERENCES "episode" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_7a78f53819f7ebd2cc47e47cecd" FOREIGN KEY ("sourceId") REFERENCES "content_source" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_episode_source"("id", "episodeId", "sourceId", "k", "matchKind", "createdAt", "updatedAt") SELECT "id", "episodeId", "sourceId", "k", "matchKind", "createdAt", "updatedAt" FROM "episode_source"`
    );
    await queryRunner.query(`DROP TABLE "episode_source"`);
    await queryRunner.query(`ALTER TABLE "temporary_episode_source" RENAME TO "episode_source"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_962d51ff0dc5ddaf3744619dd2" ON "episode_source" ("episodeId", "sourceId") `
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_media_ratings" ("userId" varchar NOT NULL, "mediaType" varchar NOT NULL, "mediaId" integer NOT NULL, "rating" varchar NOT NULL, CONSTRAINT "FK_c3e303c1c7488d7c0270fe3c3b8" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, PRIMARY KEY ("userId", "mediaType", "mediaId"))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_media_ratings"("userId", "mediaType", "mediaId", "rating") SELECT "userId", "mediaType", "mediaId", "rating" FROM "media_ratings"`
    );
    await queryRunner.query(`DROP TABLE "media_ratings"`);
    await queryRunner.query(`ALTER TABLE "temporary_media_ratings" RENAME TO "media_ratings"`);
    await queryRunner.query(`DROP INDEX "IDX_5e7aa4cbbf483add26ded0e120"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_movie_source" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "movieId" integer NOT NULL, "sourceId" integer NOT NULL, "k" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_ca1fae3f648c0f14ca7f3aa2074" UNIQUE ("movieId", "sourceId"), CONSTRAINT "FK_5e7aa4cbbf483add26ded0e1204" FOREIGN KEY ("movieId") REFERENCES "movie" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_c4606efcaee072c12ebfd44ddee" FOREIGN KEY ("sourceId") REFERENCES "content_source" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_movie_source"("id", "movieId", "sourceId", "k", "createdAt") SELECT "id", "movieId", "sourceId", "k", "createdAt" FROM "movie_source"`
    );
    await queryRunner.query(`DROP TABLE "movie_source"`);
    await queryRunner.query(`ALTER TABLE "temporary_movie_source" RENAME TO "movie_source"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_5e7aa4cbbf483add26ded0e120" ON "movie_source" ("movieId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_b142beadffd32dfe9c1afc1c28"`);
    await queryRunner.query(`DROP INDEX "IDX_039c7fcba309434f48b3ffaa58"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" varchar NOT NULL, "dedupeKey" varchar(40) NOT NULL, "type" varchar(40) NOT NULL, "mediaType" varchar(8) NOT NULL, "mediaId" integer NOT NULL, "a" varchar NOT NULL, "b" varchar NOT NULL, "seasonNumber" integer, "episodeNumber" integer, "quality" varchar(8), "sourceType" varchar(8), "previousSourceType" varchar(8), "readAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_f260e755ecee379407534d15ae6" UNIQUE ("userId", "dedupeKey"), CONSTRAINT "FK_1ced25315eb974b73391fb1c81b" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_notification"("id", "userId", "dedupeKey", "type", "mediaType", "mediaId", "a", "b", "seasonNumber", "episodeNumber", "quality", "sourceType", "previousSourceType", "readAt", "createdAt") SELECT "id", "userId", "dedupeKey", "type", "mediaType", "mediaId", "a", "b", "seasonNumber", "episodeNumber", "quality", "sourceType", "previousSourceType", "readAt", "createdAt" FROM "notification"`
    );
    await queryRunner.query(`DROP TABLE "notification"`);
    await queryRunner.query(`ALTER TABLE "temporary_notification" RENAME TO "notification"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_b142beadffd32dfe9c1afc1c28" ON "notification" ("userId", "readAt") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_039c7fcba309434f48b3ffaa58" ON "notification" ("userId", "createdAt") `
    );
    await queryRunner.query(`DROP INDEX "idx_progress_user_updated"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_progress" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" varchar NOT NULL, "playableKind" varchar(16) NOT NULL, "playableKey" varchar(128) NOT NULL, "positionSeconds" float NOT NULL, "durationSeconds" float NOT NULL, "state" varchar(16) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_b00158fdd5eb17d9593d1b7d025" UNIQUE ("userId", "playableKey"), CONSTRAINT "FK_0366c96237f98ea1c8ba6e1ec35" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_progress"("id", "userId", "playableKind", "playableKey", "positionSeconds", "durationSeconds", "state", "createdAt", "updatedAt") SELECT "id", "userId", "playableKind", "playableKey", "positionSeconds", "durationSeconds", "state", "createdAt", "updatedAt" FROM "progress"`
    );
    await queryRunner.query(`DROP TABLE "progress"`);
    await queryRunner.query(`ALTER TABLE "temporary_progress" RENAME TO "progress"`);
    await queryRunner.query(
      `CREATE INDEX "idx_progress_user_updated" ON "progress" ("userId", "updatedAt") `
    );
    await queryRunner.query(`DROP INDEX "IDX_e96eb17b26e1367d7c82e45e63"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_recent_searches" ("userId" varchar NOT NULL, "kind" varchar NOT NULL, "k" varchar NOT NULL, "v" varchar NOT NULL, "searchedAt" datetime NOT NULL, CONSTRAINT "FK_16ccbdaece9e6234a902a64cc56" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, PRIMARY KEY ("userId", "kind", "k"))`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_recent_searches"("userId", "kind", "k", "v", "searchedAt") SELECT "userId", "kind", "k", "v", "searchedAt" FROM "recent_searches"`
    );
    await queryRunner.query(`DROP TABLE "recent_searches"`);
    await queryRunner.query(`ALTER TABLE "temporary_recent_searches" RENAME TO "recent_searches"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_e96eb17b26e1367d7c82e45e63" ON "recent_searches" ("userId", "searchedAt") `
    );
    await queryRunner.query(`DROP INDEX "idx_storage_last_access"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_storage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "sourceId" integer NOT NULL, "downloadedPieces" blob NOT NULL, "size" integer NOT NULL, "logicalBytes" integer NOT NULL DEFAULT (0), "verifiedBytes" integer NOT NULL DEFAULT (0), "allocatedBytes" integer NOT NULL DEFAULT (0), "reservedBytes" integer NOT NULL DEFAULT (0), "totalPieces" integer NOT NULL DEFAULT (0), "pieceLength" integer NOT NULL DEFAULT (0), "lastInterestAt" datetime, "videoCompletedAt" datetime, "localOnly" boolean NOT NULL DEFAULT (0), "encryptedLayout" text, "activeStreams" integer NOT NULL DEFAULT (0), "downloaded" integer NOT NULL DEFAULT (0), "location" varchar(500) NOT NULL, "lastAccessAt" datetime, "lastWriteAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "REL_1f4a8027c5369109ce59af8e2d" UNIQUE ("sourceId"), CONSTRAINT "FK_1f4a8027c5369109ce59af8e2dc" FOREIGN KEY ("sourceId") REFERENCES "content_source" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_storage"("id", "sourceId", "downloadedPieces", "size", "logicalBytes", "verifiedBytes", "allocatedBytes", "reservedBytes", "totalPieces", "pieceLength", "lastInterestAt", "videoCompletedAt", "localOnly", "encryptedLayout", "activeStreams", "downloaded", "location", "lastAccessAt", "lastWriteAt", "createdAt", "updatedAt") SELECT "id", "sourceId", "downloadedPieces", "size", "logicalBytes", "verifiedBytes", "allocatedBytes", "reservedBytes", "totalPieces", "pieceLength", "lastInterestAt", "videoCompletedAt", "localOnly", "encryptedLayout", "activeStreams", "downloaded", "location", "lastAccessAt", "lastWriteAt", "createdAt", "updatedAt" FROM "storage"`
    );
    await queryRunner.query(`DROP TABLE "storage"`);
    await queryRunner.query(`ALTER TABLE "temporary_storage" RENAME TO "storage"`);
    await queryRunner.query(
      `CREATE INDEX "idx_storage_last_access" ON "storage" ("lastAccessAt") `
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_storage_file" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "storageId" integer NOT NULL, "k" text NOT NULL, "offset" integer NOT NULL, "length" integer NOT NULL, "completedAt" datetime, CONSTRAINT "UQ_0aecb2fc131af465289eac90c9a" UNIQUE ("storageId", "k"), CONSTRAINT "FK_4369a040890de257643328d19ee" FOREIGN KEY ("storageId") REFERENCES "storage" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_storage_file"("id", "storageId", "k", "offset", "length", "completedAt") SELECT "id", "storageId", "k", "offset", "length", "completedAt" FROM "storage_file"`
    );
    await queryRunner.query(`DROP TABLE "storage_file"`);
    await queryRunner.query(`ALTER TABLE "temporary_storage_file" RENAME TO "storage_file"`);
    await queryRunner.query(`DROP INDEX "IDX_fb2010290cc1ece95011f701cc"`);
    await queryRunner.query(`DROP INDEX "IDX_081de880576262b78b492f0eca"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_storage_file_claim" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "storageId" integer NOT NULL, "k" text NOT NULL, "kind" varchar(16) NOT NULL, "ownerKey" varchar(128) NOT NULL, "rangeStart" integer NOT NULL DEFAULT (0), "rangeEnd" integer, "expiresAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_d7301e1509794c733f7a191f932" UNIQUE ("storageId", "k", "kind", "ownerKey"), CONSTRAINT "FK_081de880576262b78b492f0eca5" FOREIGN KEY ("storageId") REFERENCES "storage" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_storage_file_claim"("id", "storageId", "k", "kind", "ownerKey", "rangeStart", "rangeEnd", "expiresAt", "createdAt", "updatedAt") SELECT "id", "storageId", "k", "kind", "ownerKey", "rangeStart", "rangeEnd", "expiresAt", "createdAt", "updatedAt" FROM "storage_file_claim"`
    );
    await queryRunner.query(`DROP TABLE "storage_file_claim"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_storage_file_claim" RENAME TO "storage_file_claim"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fb2010290cc1ece95011f701cc" ON "storage_file_claim" ("expiresAt") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_081de880576262b78b492f0eca" ON "storage_file_claim" ("storageId") `
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_streaming_key" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "keyHash" varchar(60) NOT NULL, "movieId" integer NOT NULL, "userId" varchar NOT NULL, "expiresAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_ab5b8bf1f75debc4d39a44d18a6" UNIQUE ("keyHash"), CONSTRAINT "FK_750bb2be75fe5ed5e362c0ba5f3" FOREIGN KEY ("movieId") REFERENCES "movie" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_d27afef990db179ee8d8e65ad0f" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_streaming_key"("id", "keyHash", "movieId", "userId", "expiresAt", "createdAt") SELECT "id", "keyHash", "movieId", "userId", "expiresAt", "createdAt" FROM "streaming_key"`
    );
    await queryRunner.query(`DROP TABLE "streaming_key"`);
    await queryRunner.query(`ALTER TABLE "temporary_streaming_key" RENAME TO "streaming_key"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "streaming_key" RENAME TO "temporary_streaming_key"`);
    await queryRunner.query(
      `CREATE TABLE "streaming_key" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "keyHash" varchar(60) NOT NULL, "movieId" integer NOT NULL, "userId" varchar NOT NULL, "expiresAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_ab5b8bf1f75debc4d39a44d18a6" UNIQUE ("keyHash"))`
    );
    await queryRunner.query(
      `INSERT INTO "streaming_key"("id", "keyHash", "movieId", "userId", "expiresAt", "createdAt") SELECT "id", "keyHash", "movieId", "userId", "expiresAt", "createdAt" FROM "temporary_streaming_key"`
    );
    await queryRunner.query(`DROP TABLE "temporary_streaming_key"`);
    await queryRunner.query(`DROP INDEX "IDX_081de880576262b78b492f0eca"`);
    await queryRunner.query(`DROP INDEX "IDX_fb2010290cc1ece95011f701cc"`);
    await queryRunner.query(
      `ALTER TABLE "storage_file_claim" RENAME TO "temporary_storage_file_claim"`
    );
    await queryRunner.query(
      `CREATE TABLE "storage_file_claim" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "storageId" integer NOT NULL, "k" text NOT NULL, "kind" varchar(16) NOT NULL, "ownerKey" varchar(128) NOT NULL, "rangeStart" integer NOT NULL DEFAULT (0), "rangeEnd" integer, "expiresAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_d7301e1509794c733f7a191f932" UNIQUE ("storageId", "k", "kind", "ownerKey"))`
    );
    await queryRunner.query(
      `INSERT INTO "storage_file_claim"("id", "storageId", "k", "kind", "ownerKey", "rangeStart", "rangeEnd", "expiresAt", "createdAt", "updatedAt") SELECT "id", "storageId", "k", "kind", "ownerKey", "rangeStart", "rangeEnd", "expiresAt", "createdAt", "updatedAt" FROM "temporary_storage_file_claim"`
    );
    await queryRunner.query(`DROP TABLE "temporary_storage_file_claim"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_081de880576262b78b492f0eca" ON "storage_file_claim" ("storageId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fb2010290cc1ece95011f701cc" ON "storage_file_claim" ("expiresAt") `
    );
    await queryRunner.query(`ALTER TABLE "storage_file" RENAME TO "temporary_storage_file"`);
    await queryRunner.query(
      `CREATE TABLE "storage_file" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "storageId" integer NOT NULL, "k" text NOT NULL, "offset" integer NOT NULL, "length" integer NOT NULL, "completedAt" datetime, CONSTRAINT "UQ_0aecb2fc131af465289eac90c9a" UNIQUE ("storageId", "k"))`
    );
    await queryRunner.query(
      `INSERT INTO "storage_file"("id", "storageId", "k", "offset", "length", "completedAt") SELECT "id", "storageId", "k", "offset", "length", "completedAt" FROM "temporary_storage_file"`
    );
    await queryRunner.query(`DROP TABLE "temporary_storage_file"`);
    await queryRunner.query(`DROP INDEX "idx_storage_last_access"`);
    await queryRunner.query(`ALTER TABLE "storage" RENAME TO "temporary_storage"`);
    await queryRunner.query(
      `CREATE TABLE "storage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "sourceId" integer NOT NULL, "downloadedPieces" blob NOT NULL, "size" integer NOT NULL, "logicalBytes" integer NOT NULL DEFAULT (0), "verifiedBytes" integer NOT NULL DEFAULT (0), "allocatedBytes" integer NOT NULL DEFAULT (0), "reservedBytes" integer NOT NULL DEFAULT (0), "totalPieces" integer NOT NULL DEFAULT (0), "pieceLength" integer NOT NULL DEFAULT (0), "lastInterestAt" datetime, "videoCompletedAt" datetime, "localOnly" boolean NOT NULL DEFAULT (0), "encryptedLayout" text, "activeStreams" integer NOT NULL DEFAULT (0), "downloaded" integer NOT NULL DEFAULT (0), "location" varchar(500) NOT NULL, "lastAccessAt" datetime, "lastWriteAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "REL_1f4a8027c5369109ce59af8e2d" UNIQUE ("sourceId"))`
    );
    await queryRunner.query(
      `INSERT INTO "storage"("id", "sourceId", "downloadedPieces", "size", "logicalBytes", "verifiedBytes", "allocatedBytes", "reservedBytes", "totalPieces", "pieceLength", "lastInterestAt", "videoCompletedAt", "localOnly", "encryptedLayout", "activeStreams", "downloaded", "location", "lastAccessAt", "lastWriteAt", "createdAt", "updatedAt") SELECT "id", "sourceId", "downloadedPieces", "size", "logicalBytes", "verifiedBytes", "allocatedBytes", "reservedBytes", "totalPieces", "pieceLength", "lastInterestAt", "videoCompletedAt", "localOnly", "encryptedLayout", "activeStreams", "downloaded", "location", "lastAccessAt", "lastWriteAt", "createdAt", "updatedAt" FROM "temporary_storage"`
    );
    await queryRunner.query(`DROP TABLE "temporary_storage"`);
    await queryRunner.query(
      `CREATE INDEX "idx_storage_last_access" ON "storage" ("lastAccessAt") `
    );
    await queryRunner.query(`DROP INDEX "IDX_e96eb17b26e1367d7c82e45e63"`);
    await queryRunner.query(`ALTER TABLE "recent_searches" RENAME TO "temporary_recent_searches"`);
    await queryRunner.query(
      `CREATE TABLE "recent_searches" ("userId" varchar NOT NULL, "kind" varchar NOT NULL, "k" varchar NOT NULL, "v" varchar NOT NULL, "searchedAt" datetime NOT NULL, PRIMARY KEY ("userId", "kind", "k"))`
    );
    await queryRunner.query(
      `INSERT INTO "recent_searches"("userId", "kind", "k", "v", "searchedAt") SELECT "userId", "kind", "k", "v", "searchedAt" FROM "temporary_recent_searches"`
    );
    await queryRunner.query(`DROP TABLE "temporary_recent_searches"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_e96eb17b26e1367d7c82e45e63" ON "recent_searches" ("userId", "searchedAt") `
    );
    await queryRunner.query(`DROP INDEX "idx_progress_user_updated"`);
    await queryRunner.query(`ALTER TABLE "progress" RENAME TO "temporary_progress"`);
    await queryRunner.query(
      `CREATE TABLE "progress" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" varchar NOT NULL, "playableKind" varchar(16) NOT NULL, "playableKey" varchar(128) NOT NULL, "positionSeconds" float NOT NULL, "durationSeconds" float NOT NULL, "state" varchar(16) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_b00158fdd5eb17d9593d1b7d025" UNIQUE ("userId", "playableKey"))`
    );
    await queryRunner.query(
      `INSERT INTO "progress"("id", "userId", "playableKind", "playableKey", "positionSeconds", "durationSeconds", "state", "createdAt", "updatedAt") SELECT "id", "userId", "playableKind", "playableKey", "positionSeconds", "durationSeconds", "state", "createdAt", "updatedAt" FROM "temporary_progress"`
    );
    await queryRunner.query(`DROP TABLE "temporary_progress"`);
    await queryRunner.query(
      `CREATE INDEX "idx_progress_user_updated" ON "progress" ("userId", "updatedAt") `
    );
    await queryRunner.query(`DROP INDEX "IDX_039c7fcba309434f48b3ffaa58"`);
    await queryRunner.query(`DROP INDEX "IDX_b142beadffd32dfe9c1afc1c28"`);
    await queryRunner.query(`ALTER TABLE "notification" RENAME TO "temporary_notification"`);
    await queryRunner.query(
      `CREATE TABLE "notification" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" varchar NOT NULL, "dedupeKey" varchar(40) NOT NULL, "type" varchar(40) NOT NULL, "mediaType" varchar(8) NOT NULL, "mediaId" integer NOT NULL, "a" varchar NOT NULL, "b" varchar NOT NULL, "seasonNumber" integer, "episodeNumber" integer, "quality" varchar(8), "sourceType" varchar(8), "previousSourceType" varchar(8), "readAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_f260e755ecee379407534d15ae6" UNIQUE ("userId", "dedupeKey"))`
    );
    await queryRunner.query(
      `INSERT INTO "notification"("id", "userId", "dedupeKey", "type", "mediaType", "mediaId", "a", "b", "seasonNumber", "episodeNumber", "quality", "sourceType", "previousSourceType", "readAt", "createdAt") SELECT "id", "userId", "dedupeKey", "type", "mediaType", "mediaId", "a", "b", "seasonNumber", "episodeNumber", "quality", "sourceType", "previousSourceType", "readAt", "createdAt" FROM "temporary_notification"`
    );
    await queryRunner.query(`DROP TABLE "temporary_notification"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_039c7fcba309434f48b3ffaa58" ON "notification" ("userId", "createdAt") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b142beadffd32dfe9c1afc1c28" ON "notification" ("userId", "readAt") `
    );
    await queryRunner.query(`DROP INDEX "IDX_5e7aa4cbbf483add26ded0e120"`);
    await queryRunner.query(`ALTER TABLE "movie_source" RENAME TO "temporary_movie_source"`);
    await queryRunner.query(
      `CREATE TABLE "movie_source" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "movieId" integer NOT NULL, "sourceId" integer NOT NULL, "k" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_ca1fae3f648c0f14ca7f3aa2074" UNIQUE ("movieId", "sourceId"))`
    );
    await queryRunner.query(
      `INSERT INTO "movie_source"("id", "movieId", "sourceId", "k", "createdAt") SELECT "id", "movieId", "sourceId", "k", "createdAt" FROM "temporary_movie_source"`
    );
    await queryRunner.query(`DROP TABLE "temporary_movie_source"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_5e7aa4cbbf483add26ded0e120" ON "movie_source" ("movieId") `
    );
    await queryRunner.query(`ALTER TABLE "media_ratings" RENAME TO "temporary_media_ratings"`);
    await queryRunner.query(
      `CREATE TABLE "media_ratings" ("userId" varchar NOT NULL, "mediaType" varchar NOT NULL, "mediaId" integer NOT NULL, "rating" varchar NOT NULL, PRIMARY KEY ("userId", "mediaType", "mediaId"))`
    );
    await queryRunner.query(
      `INSERT INTO "media_ratings"("userId", "mediaType", "mediaId", "rating") SELECT "userId", "mediaType", "mediaId", "rating" FROM "temporary_media_ratings"`
    );
    await queryRunner.query(`DROP TABLE "temporary_media_ratings"`);
    await queryRunner.query(`DROP INDEX "IDX_962d51ff0dc5ddaf3744619dd2"`);
    await queryRunner.query(`ALTER TABLE "episode_source" RENAME TO "temporary_episode_source"`);
    await queryRunner.query(
      `CREATE TABLE "episode_source" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "episodeId" integer NOT NULL, "sourceId" integer NOT NULL, "k" text, "matchKind" varchar(16) NOT NULL DEFAULT ('single'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_372b06b20e884eee7cab1247d7f" UNIQUE ("episodeId", "sourceId", "k"))`
    );
    await queryRunner.query(
      `INSERT INTO "episode_source"("id", "episodeId", "sourceId", "k", "matchKind", "createdAt", "updatedAt") SELECT "id", "episodeId", "sourceId", "k", "matchKind", "createdAt", "updatedAt" FROM "temporary_episode_source"`
    );
    await queryRunner.query(`DROP TABLE "temporary_episode_source"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_962d51ff0dc5ddaf3744619dd2" ON "episode_source" ("episodeId", "sourceId") `
    );
    await queryRunner.query(`ALTER TABLE "episode" RENAME TO "temporary_episode"`);
    await queryRunner.query(
      `CREATE TABLE "episode" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tmdbId" integer NOT NULL, "seasonId" integer NOT NULL, "episodeNumber" integer NOT NULL, "name" varchar NOT NULL, "overview" varchar NOT NULL, "airDate" varchar(50), "stillPath" varchar NOT NULL, "imdbId" varchar NOT NULL, "providerSeasonNumber" integer, "providerEpisodeNumber" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_619ebf32ab6d66ecab8cc9ba7b3" UNIQUE ("seasonId", "episodeNumber"))`
    );
    await queryRunner.query(
      `INSERT INTO "episode"("id", "tmdbId", "seasonId", "episodeNumber", "name", "overview", "airDate", "stillPath", "imdbId", "providerSeasonNumber", "providerEpisodeNumber", "createdAt", "updatedAt") SELECT "id", "tmdbId", "seasonId", "episodeNumber", "name", "overview", "airDate", "stillPath", "imdbId", "providerSeasonNumber", "providerEpisodeNumber", "createdAt", "updatedAt" FROM "temporary_episode"`
    );
    await queryRunner.query(`DROP TABLE "temporary_episode"`);
    await queryRunner.query(`ALTER TABLE "season" RENAME TO "temporary_season"`);
    await queryRunner.query(
      `CREATE TABLE "season" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tmdbId" integer NOT NULL, "tvShowId" integer NOT NULL, "seasonNumber" integer NOT NULL, "name" varchar NOT NULL, "overview" varchar NOT NULL, "airDate" varchar, "posterPath" varchar, "synced" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_b7fb194fd71ecf6ada1a4feea6a" UNIQUE ("tvShowId", "seasonNumber"))`
    );
    await queryRunner.query(
      `INSERT INTO "season"("id", "tmdbId", "tvShowId", "seasonNumber", "name", "overview", "airDate", "posterPath", "synced", "createdAt", "updatedAt") SELECT "id", "tmdbId", "tvShowId", "seasonNumber", "name", "overview", "airDate", "posterPath", "synced", "createdAt", "updatedAt" FROM "temporary_season"`
    );
    await queryRunner.query(`DROP TABLE "temporary_season"`);
    await queryRunner.query(`DROP INDEX "IDX_532f60aac0560dcfbb5d5fb25e"`);
    await queryRunner.query(
      `ALTER TABLE "availability_request" RENAME TO "temporary_availability_request"`
    );
    await queryRunner.query(
      `CREATE TABLE "availability_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" varchar NOT NULL, "k" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_9c7ecdb86bef971fd0f266f9e2f" UNIQUE ("userId", "k"))`
    );
    await queryRunner.query(
      `INSERT INTO "availability_request"("id", "userId", "k", "createdAt") SELECT "id", "userId", "k", "createdAt" FROM "temporary_availability_request"`
    );
    await queryRunner.query(`DROP TABLE "temporary_availability_request"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_532f60aac0560dcfbb5d5fb25e" ON "availability_request" ("k") `
    );
    await queryRunner.query(`DROP INDEX "IDX_56b91d98f71e3d1b649ed6e9f3"`);
    await queryRunner.query(`DROP INDEX "IDX_5025049479f0f298e6a2e7642a"`);
    await queryRunner.query(`DROP INDEX "IDX_927e2df7f4574d1989e9db0518"`);
    await queryRunner.query(`DROP INDEX "IDX_610102b60fea1455310ccd299d"`);
    await queryRunner.query(`DROP INDEX "IDX_c25bc63d248ca90e8dcc1d92d0"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" RENAME TO "temporary_refresh_tokens"`);
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" varchar PRIMARY KEY NOT NULL, "tokenHash" varchar(64) NOT NULL, "previousTokenHash" varchar(64), "rotatedAt" datetime, "expiresAt" datetime NOT NULL, "userId" varchar NOT NULL, "session" varchar(64) NOT NULL, "userAgent" varchar(500), "lastIpAddress" varchar(45), "lastAccessedAt" datetime NOT NULL, "accessCount" integer NOT NULL DEFAULT (1), "issueIpAddress" varchar(45), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
    await queryRunner.query(
      `INSERT INTO "refresh_tokens"("id", "tokenHash", "previousTokenHash", "rotatedAt", "expiresAt", "userId", "session", "userAgent", "lastIpAddress", "lastAccessedAt", "accessCount", "issueIpAddress", "createdAt", "updatedAt") SELECT "id", "tokenHash", "previousTokenHash", "rotatedAt", "expiresAt", "userId", "session", "userAgent", "lastIpAddress", "lastAccessedAt", "accessCount", "issueIpAddress", "createdAt", "updatedAt" FROM "temporary_refresh_tokens"`
    );
    await queryRunner.query(`DROP TABLE "temporary_refresh_tokens"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_56b91d98f71e3d1b649ed6e9f3" ON "refresh_tokens" ("expiresAt") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5025049479f0f298e6a2e7642a" ON "refresh_tokens" ("userId", "session") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_927e2df7f4574d1989e9db0518" ON "refresh_tokens" ("session") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_610102b60fea1455310ccd299d" ON "refresh_tokens" ("userId") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c25bc63d248ca90e8dcc1d92d0" ON "refresh_tokens" ("tokenHash") `
    );
    await queryRunner.query(`DROP TABLE "streaming_key"`);
    await queryRunner.query(`DROP INDEX "IDX_081de880576262b78b492f0eca"`);
    await queryRunner.query(`DROP INDEX "IDX_fb2010290cc1ece95011f701cc"`);
    await queryRunner.query(`DROP TABLE "storage_file_claim"`);
    await queryRunner.query(`DROP TABLE "storage_file"`);
    await queryRunner.query(`DROP INDEX "idx_storage_last_access"`);
    await queryRunner.query(`DROP TABLE "storage"`);
    await queryRunner.query(`DROP INDEX "IDX_e96eb17b26e1367d7c82e45e63"`);
    await queryRunner.query(`DROP TABLE "recent_searches"`);
    await queryRunner.query(`DROP INDEX "IDX_e2d710efa885a5cfff9273e714"`);
    await queryRunner.query(`DROP INDEX "IDX_4fa4f17bcf674bc0f7d79d5fa4"`);
    await queryRunner.query(`DROP INDEX "IDX_1f5171c1f14b3394a53f1477bf"`);
    await queryRunner.query(`DROP TABLE "qr_login_requests"`);
    await queryRunner.query(`DROP INDEX "idx_progress_user_updated"`);
    await queryRunner.query(`DROP TABLE "progress"`);
    await queryRunner.query(`DROP INDEX "IDX_8887f18325ba6d988fc29335a8"`);
    await queryRunner.query(`DROP TABLE "playback_grant"`);
    await queryRunner.query(`DROP INDEX "IDX_039c7fcba309434f48b3ffaa58"`);
    await queryRunner.query(`DROP INDEX "IDX_b142beadffd32dfe9c1afc1c28"`);
    await queryRunner.query(`DROP TABLE "notification"`);
    await queryRunner.query(`DROP INDEX "IDX_5e7aa4cbbf483add26ded0e120"`);
    await queryRunner.query(`DROP TABLE "movie_source"`);
    await queryRunner.query(`DROP TABLE "movie"`);
    await queryRunner.query(`DROP TABLE "migration_version"`);
    await queryRunner.query(`DROP TABLE "media_ratings"`);
    await queryRunner.query(`DROP INDEX "IDX_b5ff96d400619d86b800eccafc"`);
    await queryRunner.query(`DROP TABLE "media_probe"`);
    await queryRunner.query(`DROP INDEX "IDX_a9e2567f3c0cbd174f4b1eaf68"`);
    await queryRunner.query(`DROP INDEX "IDX_9fe12e06e8039792a1a808a536"`);
    await queryRunner.query(`DROP TABLE "media_list_item"`);
    await queryRunner.query(`DROP INDEX "IDX_d5630bb68006fc178c98fa3f92"`);
    await queryRunner.query(`DROP TABLE "media_list"`);
    await queryRunner.query(`DROP INDEX "IDX_962d51ff0dc5ddaf3744619dd2"`);
    await queryRunner.query(`DROP TABLE "episode_source"`);
    await queryRunner.query(`DROP TABLE "episode"`);
    await queryRunner.query(`DROP TABLE "season"`);
    await queryRunner.query(`DROP TABLE "tv_show"`);
    await queryRunner.query(`DROP TABLE "content_source"`);
    await queryRunner.query(`DROP INDEX "IDX_490481070ae3af85b32066e597"`);
    await queryRunner.query(`DROP INDEX "IDX_2729a2b728ede1d2f0fd316ad5"`);
    await queryRunner.query(`DROP INDEX "IDX_eae90ac91b98b90c1b9798f838"`);
    await queryRunner.query(`DROP TABLE "background_job"`);
    await queryRunner.query(`DROP INDEX "IDX_532f60aac0560dcfbb5d5fb25e"`);
    await queryRunner.query(`DROP TABLE "availability_request"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP INDEX "IDX_56b91d98f71e3d1b649ed6e9f3"`);
    await queryRunner.query(`DROP INDEX "IDX_5025049479f0f298e6a2e7642a"`);
    await queryRunner.query(`DROP INDEX "IDX_927e2df7f4574d1989e9db0518"`);
    await queryRunner.query(`DROP INDEX "IDX_610102b60fea1455310ccd299d"`);
    await queryRunner.query(`DROP INDEX "IDX_c25bc63d248ca90e8dcc1d92d0"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_eventType_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_createdAt"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
  }
}
