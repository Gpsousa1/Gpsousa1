import { RoleName } from '@prisma/client';

export type TokenType = 'access' | 'refresh';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: RoleName[];
  /** Permissions as "action:resource" strings, embedded for stateless RBAC. */
  perms: string[];
  jti: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  familyId: string;
  jti: string;
  type: 'refresh';
}

/** Shape attached to req.user after a successful access-token validation. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: RoleName[];
  perms: string[];
  jti: string;
}
