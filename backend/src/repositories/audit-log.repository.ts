import type { QueryDeepPartialEntity, Repository } from 'typeorm';
import { And, Between, In, LessThan, Not } from 'typeorm';

import type { Database } from '@database/database';
import type { AuditEventSeverity, AuditEventType } from '@entities/audit-log.entity';
import { AuditLog } from '@entities/audit-log.entity';

export class AuditLogRepository {
  private readonly repository: Repository<AuditLog>;

  constructor(database: Database) {
    this.repository = database.getRepository(AuditLog);
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

  /** One multi-row INSERT, so a burst of events takes a single turn in the write lane. */
  async insertMany(auditLogs: Partial<AuditLog>[]): Promise<void> {
    if (auditLogs.length === 0) return;
    await this.repository.insert(auditLogs as QueryDeepPartialEntity<AuditLog>[]);
  }

  /**
   * Delete rows created before `beforeDate`, optionally only (or all but) some event types.
   * Works in batches so a large backlog never holds the write lane for one long statement.
   */
  async deleteOldLogs(
    beforeDate: Date,
    filter: { eventTypes?: AuditEventType[]; excludeEventTypes?: AuditEventType[] } = {},
    batchSize = 1000
  ): Promise<number> {
    const eventTypeConditions = [
      ...(filter.eventTypes ? [In(filter.eventTypes)] : []),
      ...(filter.excludeEventTypes ? [Not(In(filter.excludeEventTypes))] : []),
    ];
    const where = {
      createdAt: LessThan(beforeDate),
      // Both filters apply when both are given.
      ...(eventTypeConditions.length > 0 && { eventType: And(...eventTypeConditions) }),
    };
    let deleted = 0;
    for (;;) {
      const rows = await this.repository.find({ select: { id: true }, where, take: batchSize });
      if (rows.length === 0) return deleted;
      const result = await this.repository.delete({ id: In(rows.map(row => row.id)) });
      deleted += result.affected ?? rows.length;
      if (rows.length < batchSize) return deleted;
    }
  }
}
