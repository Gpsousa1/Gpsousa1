import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditLevel } from '@prisma/client';
import { Observable, tap } from 'rxjs';
import { AuthenticatedUser } from '../auth/auth.types';
import { AuditService } from '../../modules/audit/audit.service';
import { AUDIT_KEY, AuditMeta } from './audit.decorator';

/**
 * Records an audit entry for any handler annotated with @Audit().
 * Records the outcome (INFO on success, WARNING on error) without leaking
 * sensitive request bodies.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!meta) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = req.user;
    const base = {
      action: meta.action,
      resource: meta.resource,
      ip: req.ip,
      userAgent: req.get?.('user-agent') ?? undefined,
    };

    return next.handle().pipe(
      tap({
        next: () => {
          void this.audit.record({
            ...base,
            actorId: user?.id ?? null,
            level: AuditLevel.INFO,
          });
        },
        error: (err) => {
          void this.audit.record({
            ...base,
            actorId: user?.id ?? null,
            level: AuditLevel.WARNING,
            meta: { error: (err as Error)?.message },
          });
        },
      }),
    );
  }
}
