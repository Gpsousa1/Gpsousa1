import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Restricts a route to users holding ALL of the given permissions.
 * Each permission is an "action:resource" string, e.g. "approve:credit".
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
