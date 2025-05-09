import type { DataSource, Repository } from 'typeorm';
import { Between } from 'typeorm';

import type { AuditEventSeverity, AuditEventType } from '@entities/audit-log.entity';
import { AuditLog } from '@entities/audit-log.entity';

export class AuditLogRepository {
  private readonly repository: Repository<AuditLog>;

  constructor(datasource: DataSource) {
    this.repository = datasource.getRepository(AuditLog);
  }

  async findById(id: string): Promise<AuditLog | null> {
    return this.repository.findOne({
      where: { id },
    });
  }

  async create(auditLog: Partial<AuditLog>): Promise<AuditLog> {
    const newAuditLog = this.repository.create(auditLog);
    return this.repository.save(newAuditLog);
  }

  async findByEventType(eventType: AuditEventType): Promise<AuditLog[]> {
    return this.repository.find({
      where: { eventType },
      order: { createdAt: 'DESC' },
    });
  }

  async findBySeverity(severity: AuditEventSeverity): Promise<AuditLog[]> {
    return this.repository.find({
      where: { severity },
      order: { createdAt: 'DESC' },
    });
  }

  async findByUserId(userEmail: string): Promise<AuditLog[]> {
    return this.repository.find({
      where: { userEmail },
      order: { createdAt: 'DESC' },
    });
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<AuditLog[]> {
    return this.repository.find({
      where: {
        createdAt: Between(startDate, endDate),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findRecent(limit: number = 100): Promise<AuditLog[]> {
    return this.repository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async deleteOldLogs(beforeDate: Date): Promise<number> {
    const result = await this.repository.delete({
      createdAt: Between(new Date(0), beforeDate),
    });
    return result.affected || 0;
  }
}
