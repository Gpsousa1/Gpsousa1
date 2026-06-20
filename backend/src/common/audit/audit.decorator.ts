import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'auditAction';

export interface AuditMeta {
  action: string;
  resource: string;
}

/** Marks a route so the AuditInterceptor records an append-only audit entry. */
export const Audit = (action: string, resource: string) =>
  SetMetadata(AUDIT_KEY, { action, resource } as AuditMeta);
