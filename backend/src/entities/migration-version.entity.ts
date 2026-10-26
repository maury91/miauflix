import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * How many data migrations this database has applied (see database/migrations). One row, id 1.
 * Schema changes still come from TypeORM's synchronize; migrations only rewrite data.
 */
@Entity('migration_version')
export class MigrationVersion {
  @PrimaryColumn()
  id: number;

  /** Count of applied migrations: the index of the next one to run. */
  @Column({ default: 0 })
  version: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
