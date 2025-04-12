import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuditLogsTable1739913600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "eventType" varchar(25) NOT NULL,
        "severity" varchar(10) NOT NULL DEFAULT 'INFO',
        "description" text,
        "ipAddress" text,
        "userAgent" text,
        "metadata" jsonb,
        "userEmail" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_audit_logs_eventType" CHECK (
          "eventType" IN (
            'LOGIN', 'LOGOUT', 'LOGIN_FAILURE', 'PASSWORD_CHANGE',
            'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_COMPLETE',
            'TOKEN_REFRESH', 'TOKEN_INVALIDATION', 'USER_CREATION',
            'USER_UPDATE', 'USER_DELETION', 'ROLE_CHANGE',
            'API_ACCESS', 'API_ERROR', 'CONFIGURATION_CHANGE',
            'SECURITY_SETTING_CHANGE', 'SUSPICIOUS_ACTIVITY',
            'RATE_LIMIT_EXCEEDED', 'IP_BLOCKED', 'IP_UNBLOCKED',
            'OTHER'
          )
        ),
        CONSTRAINT "CHK_audit_logs_severity" CHECK (
          "severity" IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_eventType"
      ON "audit_logs" ("eventType")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_severity"
      ON "audit_logs" ("severity")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_createdAt"
      ON "audit_logs" ("createdAt")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_userEmail"
      ON "audit_logs" ("userEmail")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_userEmail"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_severity"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_eventType"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
  }
}
