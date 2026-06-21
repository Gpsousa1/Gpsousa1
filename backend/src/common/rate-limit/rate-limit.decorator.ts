import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

/** Per-route override of the global rate limit (e.g. stricter on auth). */
export const RateLimit = (limit: number, windowSeconds: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowSeconds } as RateLimitOptions);
