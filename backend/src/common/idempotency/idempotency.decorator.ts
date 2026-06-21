import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotent';

/**
 * Marks a mutation as idempotent. When set, the client MUST send an
 * `Idempotency-Key` header; duplicate requests with the same key replay the
 * first stored response instead of re-executing side effects.
 */
export const Idempotent = (ttlSeconds = 86400) => SetMetadata(IDEMPOTENT_KEY, ttlSeconds);
