import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum AuditEventType {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_COMPLETE = 'PASSWORD_RESET_COMPLETE',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_INVALIDATION = 'TOKEN_INVALIDATION',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  USER_CREATION = 'USER_CREATION',
  USER_UPDATE = 'USER_UPDATE',
  USER_DELETION = 'USER_DELETION',
  ROLE_CHANGE = 'ROLE_CHANGE',
  API_ACCESS = 'API_ACCESS',
  API_ERROR = 'API_ERROR',
  CONFIGURATION_CHANGE = 'CONFIGURATION_CHANGE',
  SECURITY_SETTING_CHANGE = 'SECURITY_SETTING_CHANGE',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  IP_BLOCKED = 'IP_BLOCKED',
  IP_UNBLOCKED = 'IP_UNBLOCKED',
  OTHER = 'OTHER',
}

export enum AuditEventSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

@Entity('audit_logs')
// Retention deletes by event type and age; the recent-logs view orders by age.
@Index('IDX_audit_logs_eventType_createdAt', ['eventType', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    enum: AuditEventType,
    nullable: false,
  })
  eventType: AuditEventType;

  @Column({
    type: 'varchar',
    enum: AuditEventSeverity,
    default: AuditEventSeverity.INFO,
  })
  severity: AuditEventSeverity;

  @Column({ nullable: true, type: 'varchar', length: 500 })
  description: string | null;

  @Column({ nullable: true, type: 'varchar', length: 50 })
  ipAddress: string | null;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown>;

  @Column({ nullable: true })
  userEmail: string;

  @Index('IDX_audit_logs_createdAt')
  @CreateDateColumn()
  createdAt: Date;
}
