import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

export enum AuditEventType {
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  LOGIN_FAILURE = "LOGIN_FAILURE",
  PASSWORD_CHANGE = "PASSWORD_CHANGE",
  PASSWORD_RESET_REQUEST = "PASSWORD_RESET_REQUEST",
  PASSWORD_RESET_COMPLETE = "PASSWORD_RESET_COMPLETE",
  TOKEN_REFRESH = "TOKEN_REFRESH",
  TOKEN_INVALIDATION = "TOKEN_INVALIDATION",
  UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS",
  USER_CREATION = "USER_CREATION",
  USER_UPDATE = "USER_UPDATE",
  USER_DELETION = "USER_DELETION",
  ROLE_CHANGE = "ROLE_CHANGE",
  API_ACCESS = "API_ACCESS",
  API_ERROR = "API_ERROR",
  CONFIGURATION_CHANGE = "CONFIGURATION_CHANGE",
  SECURITY_SETTING_CHANGE = "SECURITY_SETTING_CHANGE",
  SUSPICIOUS_ACTIVITY = "SUSPICIOUS_ACTIVITY",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  IP_BLOCKED = "IP_BLOCKED",
  IP_UNBLOCKED = "IP_UNBLOCKED",
  OTHER = "OTHER",
}

export enum AuditEventSeverity {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL",
}

@Entity("audit_logs")
export class AuditLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({
    type: "varchar",
    length: 25,
    enum: AuditEventType,
    nullable: false,
  })
  eventType: AuditEventType;

  @Column({
    type: "varchar",
    length: 10,
    enum: AuditEventSeverity,
    default: AuditEventSeverity.INFO,
  })
  severity: AuditEventSeverity;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ type: "json", nullable: true })
  metadata: Record<string, any>;

  @Column({ nullable: true })
  userEmail: string;

  @CreateDateColumn()
  createdAt: Date;
}
