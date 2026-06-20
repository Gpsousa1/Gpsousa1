import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from './auth.types';
import { PERMISSIONS_KEY } from './permissions.decorator';

/** Enforces fine-grained permissions declared with @RequirePermissions(). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const user: AuthenticatedUser | undefined = context
      .switchToHttp()
      .getRequest().user;

    const granted = new Set(user?.perms ?? []);
    const ok = required.every((perm) => granted.has(perm));
    if (!user || !ok) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
