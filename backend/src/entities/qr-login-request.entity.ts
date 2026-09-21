import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type QrLoginRequestState =
  | 'approved'
  | 'claimed'
  | 'claiming'
  | 'expired'
  | 'pending'
  | 'rejected';

@Entity('qr_login_requests')
@Index(['approvalTokenHash'], { unique: true })
@Index(['claimTokenHash'], { unique: true })
@Index(['expiresAt'])
export class QrLoginRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64 })
  approvalTokenHash: string;

  @Column({ length: 64 })
  claimTokenHash: string;

  @Column({ type: 'varchar' })
  state: QrLoginRequestState;

  @Column({ type: 'varchar', nullable: true })
  approvedUserId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  claimedAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  claimLease: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
