import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../auth/auth.types';
import { RedisService } from '../../infra/redis/redis.service';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';

const DEFAULT: RateLimitOptions = { limit: 300, windowSeconds: 60 };

/**
 * Distributed (Redis-backed) fixed-window rate limiter. Works across API
 * replicas. Keyed by authenticated user when available, else by IP. Per-route
 * limits via @RateLimit(); a sensible global default otherwise. Fails open if
 * Redis is unavailable (rate limiting must never take the API down).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const opts =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT;

    const req = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = req.user;
    const subject = user?.id ?? req.ip ?? 'anon';
    const route = req.route?.path ?? req.url;
    const key = `${subject}:${route}`;

    let count: number;
    try {
      count = await this.redis.incrRate(key, opts.windowSeconds);
    } catch {
      return true; // fail-open
    }

    if (count > opts.limit) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
