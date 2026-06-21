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

  // ── Generic JSON cache (score/fraud caches, etc.) ──
  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', Math.max(ttlSeconds, 1));
    } catch {
      // cache is best-effort; never break the request on cache failure
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch {
      // best-effort
    }
  }

  // ── Idempotency primitives ──
  /** Atomically claims an idempotency key. Returns true if this caller won the claim. */
  async claimIdempotency(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const res = await this.client.set(key, 'PROCESSING', 'EX', Math.max(ttlSeconds, 1), 'NX');
      return res === 'OK';
    } catch {
      // Redis down → fail-open (let the request proceed without idempotency).
      return true;
    }
  }

  async getIdempotentResult<T>(key: string): Promise<{ status: number; body: T } | 'PROCESSING' | null> {
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      if (raw === 'PROCESSING') return 'PROCESSING';
      return JSON.parse(raw) as { status: number; body: T };
    } catch {
      return null;
    }
  }

  async storeIdempotentResult(key: string, status: number, body: unknown, ttlSeconds: number): Promise<void> {
    await this.setJson(key, { status, body }, ttlSeconds);
  }
}
