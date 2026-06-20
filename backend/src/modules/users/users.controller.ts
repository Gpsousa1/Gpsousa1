import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/auth.types';

@Controller({ path: 'me', version: '1' })
export class UsersController {
  /** Returns the identity/authorization context of the authenticated caller. */
  @Get()
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.perms,
    };
  }
}
