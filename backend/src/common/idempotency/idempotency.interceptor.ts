import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { AuthenticatedUser } from '../auth/auth.types';
import { RedisService } from '../../infra/redis/redis.service';
import { IDEMPOTENT_KEY } from './idempotency.decorator';

/**
 * Enforces idempotency on routes annotated with @Idempotent(). Critical for
 * fintech mutations (avoids duplicate credit operations / PIX charges on
 * client retries or double-submit). Backed by Redis (distributed, works across
 * API replicas). Fails open if Redis is unavailable.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ttl = this.reflector.getAllAndOverride<number>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!ttl) return next.handle();

    const req = context.switchToHttp().getRequest();
    const headerKey: string | undefined = req.headers['idempotency-key'];
    if (!headerKey) {
      // No key provided → behave as a normal request (no replay protection).
      return next.handle();
    }

    const user: AuthenticatedUser | undefined = req.user;
    const scope = user?.id ?? req.ip ?? 'anon';
    const redisKey = `idemp:${scope}:${req.method}:${req.route?.path ?? req.url}:${headerKey}`;

    return from(this.redis.claimIdempotency(redisKey, ttl)).pipe(
      switchMap((won) => {
        if (won) {
          // First time: execute and store the successful response.
          return next.handle().pipe(
            tap((body) => {
              const status = context.switchToHttp().getResponse().statusCode ?? 200;
              void this.redis.storeIdempotentResult(redisKey, status, body, ttl);
            }),
          );
        }
        // Key already claimed: replay stored result or reject if still in flight.
        return from(this.redis.getIdempotentResult(redisKey)).pipe(
          switchMap((stored) => {
            if (stored && stored !== 'PROCESSING') {
              const res = context.switchToHttp().getResponse();
              res.status(stored.status);
              return of(stored.body);
            }
            throw new ConflictException('Request with this Idempotency-Key is still being processed');
          }),
        );
      }),
    );
  }
}
