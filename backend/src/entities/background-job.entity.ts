import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BackgroundJobStatus = 'dead' | 'leased' | 'pending';

@Entity()
@Index(['type', 'dedupeKey'], {
  unique: true,
  where: `"status" != 'dead'`,
})
@Index(['status', 'runAfter', 'leaseUntil'])
@Index(['status', 'priority', 'runAfter'])
export class BackgroundJob {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: string;

  @Column()
  dedupeKey: string;

  @Column({ type: 'text' })
  payload: string;

  @Column({ default: 'pending' })
  status: BackgroundJobStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'int', default: 5 })
  maxAttempts: number;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  runAfter: Date;

  @Column({ type: 'datetime', nullable: true })
  leaseUntil: Date | null;

  @Column({ type: 'varchar', nullable: true })
  leaseOwner: string | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
