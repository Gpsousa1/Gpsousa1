import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { AuthenticatedUser } from './auth.types';
import { ROLES_KEY } from './roles.decorator';

/** Enforces role requirements declared with @Roles(). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const user: AuthenticatedUser | undefined = context
      .switchToHttp()
      .getRequest().user;

    if (!user || !required.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
