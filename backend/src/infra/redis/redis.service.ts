import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Thin wrapper around ioredis exposing the primitives the FASE 1 foundation
 * needs: refresh-token denylist, rate-limit counters and generic cache.
 * Higher-level engines (score/fraud cache, idempotency) build on top of this
 * in later phases.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) public readonly client: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  /** Add a refresh-token jti to the denylist until its natural expiry. */
  async denyRefreshToken(jti: string, ttlSeconds: number): Promise<void> {
    await this.client.set(`rt:revoked:${jti}`, '1', 'EX', Math.max(ttlSeconds, 1));
  }

  async isRefreshTokenDenied(jti: string): Promise<boolean> {
    return (await this.client.exists(`rt:revoked:${jti}`)) === 1;
  }

  /** Fixed-window rate limiter. Returns the current hit count for the window. */
  async incrRate(key: string, windowSeconds: number): Promise<number> {
    const redisKey = `rl:${key}`;
    const count = await this.client.incr(redisKey);
    if (count === 1) {
      await this.client.expire(redisKey, windowSeconds);
    }
    return count;
  }
}
