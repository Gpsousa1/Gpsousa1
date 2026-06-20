import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { TokenService } from './token.service';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  /** Loads the role names and flattened permission strings for a user. */
  private async loadAuthz(
    userId: string,
  ): Promise<{ roles: RoleName[]; perms: string[] }> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    const roles = userRoles.map((ur) => ur.role.name);
    const perms = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.permissions) {
        perms.add(`${rp.permission.action}:${rp.permission.resource}`);
      }
    }
    return { roles, perms: [...perms] };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const rounds = this.config.get<number>('security.bcryptRounds') as number;
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
      },
    });

    return { id: user.id, email: user.email, displayName: user.displayName };
  }

  async login(dto: LoginDto, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    const ok =
      user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !ok || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { roles, perms } = await this.loadAuthz(user.id);
    return this.issueAndPersist(user.id, user.email, roles, perms, meta);
  }

  async refresh(refreshToken: string, meta: RequestMeta) {
    let payload;
    try {
      payload = await this.tokens.verifyRefresh(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.tokens.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    // Reuse detection: a valid signature whose hash is unknown or already
    // revoked means the token was replayed -> revoke the entire family.
    if (!stored || stored.revoked) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: payload.familyId, revoked: false },
        data: { revoked: true },
      });
      await this.redis.denyRefreshToken(
        payload.jti,
        this.tokens.refreshTtlSeconds(),
      );
      this.logger.warn(
        `Refresh token reuse detected for family ${payload.familyId}`,
      );
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (await this.redis.isRefreshTokenDenied(payload.jti)) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    // Rotate: revoke current, issue a fresh pair within the same family.
    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { revoked: true },
    });

    const { roles, perms } = await this.loadAuthz(payload.sub);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not active');
    }

    return this.issueAndPersist(
      user.id,
      user.email,
      roles,
      perms,
      meta,
      payload.familyId,
    );
  }

  async logout(refreshToken: string) {
    try {
      const payload = await this.tokens.verifyRefresh(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { familyId: payload.familyId, revoked: false },
        data: { revoked: true },
      });
      await this.redis.denyRefreshToken(
        payload.jti,
        this.tokens.refreshTtlSeconds(),
      );
    } catch {
      // Idempotent logout: invalid/expired tokens are treated as logged out.
    }
    return { success: true };
  }

  private async issueAndPersist(
    userId: string,
    email: string,
    roles: RoleName[],
    perms: string[],
    meta: RequestMeta,
    familyId?: string,
  ) {
    const issued = await this.tokens.issueTokens({
      userId,
      email,
      roles,
      perms,
      familyId,
    });

    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId: issued.familyId,
        tokenHash: this.tokens.hash(issued.refreshToken),
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt: issued.refreshExpiresAt,
      },
    });

    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      tokenType: 'Bearer',
      roles,
    };
  }
}
