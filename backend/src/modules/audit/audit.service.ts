import { Injectable, Logger } from '@nestjs/common';
import { AuditLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  buildPage,
  DEFAULT_PAGE,
  parseCursorArgs,
  prismaCursor,
} from '../../common/pagination/cursor';

export interface AuditEvent {
  actorId?: string | null;
  action: string;
  resource: string;
  level?: AuditLevel;
  ip?: string;
  userAgent?: string;
  meta?: Prisma.InputJsonValue;
}

/**
 * Writes append-only audit entries. Failures are logged but never propagate,
 * so auditing can never break a business request.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: event.actorId ?? null,
          action: event.action,
          resource: event.resource,
          level: event.level ?? AuditLevel.INFO,
          ip: event.ip,
          userAgent: event.userAgent,
          meta: event.meta,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to persist audit log: ${(err as Error).message}`);
    }
  }

  async list(params: { action?: string; level?: AuditLevel; cursor?: string; take?: string }) {
    const args = parseCursorArgs(params.cursor, params.take);
    const rows = await this.prisma.auditLog.findMany({
      where: { action: params.action, level: params.level },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...prismaCursor(args),
    });
    return buildPage(rows, args.limit ?? DEFAULT_PAGE);
  }
}
