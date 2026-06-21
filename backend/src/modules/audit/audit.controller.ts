import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditLevel, RoleName } from '@prisma/client';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AuditService } from './audit.service';

/**
 * Admin-only access to the audit trail. Demonstrates real RBAC enforcement:
 * both a role (ADMIN) and a fine-grained permission (read:audit) are required.
 */
@Controller({ path: 'admin/audit-logs', version: '1' })
@UseGuards(RolesGuard, PermissionsGuard)
@Roles(RoleName.ADMIN)
@RequirePermissions('read:audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query('action') action?: string,
    @Query('level') level?: AuditLevel,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.audit.list({ action, level, cursor, take });
  }
}
