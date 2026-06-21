import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import {
  AccessTokenPayload,
  RefreshTokenPayload,
} from '../../common/auth/auth.types';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshJti: string;
  familyId: string;
  refreshExpiresAt: Date;
}

/**
 * Stateless token minting + refresh-token hashing helpers.
 * Refresh tokens are opaque-by-policy: only their SHA-256 hash is persisted.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private ttlToSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])?$/.exec(ttl.trim());
    if (!match) return 0;
    const value = parseInt(match[1], 10);
    const unit = match[2] ?? 's';
    const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1;
    return value * factor;
  }

  async issueTokens(params: {
    userId: string;
    email: string;
    roles: RoleName[];
    perms: string[];
    familyId?: string;
  }): Promise<IssuedTokens> {
    const familyId = params.familyId ?? randomUUID();
    const refreshJti = randomUUID();

    const accessPayload: AccessTokenPayload = {
      sub: params.userId,
      email: params.email,
      roles: params.roles,
      perms: params.perms,
      jti: randomUUID(),
      type: 'access',
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: params.userId,
      familyId,
      jti: refreshJti,
      type: 'refresh',
    };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessTtl'),
    });

    const refreshTtl = this.config.get<string>('jwt.refreshTtl') as string;
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: refreshTtl,
    });

    const refreshExpiresAt = new Date(
      Date.now() + this.ttlToSeconds(refreshTtl) * 1000,
    );

    return { accessToken, refreshToken, refreshJti, familyId, refreshExpiresAt };
  }

  async verifyRefresh(token: string): Promise<RefreshTokenPayload> {
    return this.jwt.verifyAsync<RefreshTokenPayload>(token, {
      secret: this.config.get<string>('jwt.refreshSecret'),
    });
  }

  refreshTtlSeconds(): number {
    return this.ttlToSeconds(this.config.get<string>('jwt.refreshTtl') as string);
  }
}
