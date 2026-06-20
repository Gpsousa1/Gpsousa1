import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/public.decorator';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async check() {
    const [db, cache] = await Promise.all([
      this.prisma
        .$queryRaw`SELECT 1`.then(() => true)
        .catch(() => false),
      this.redis.ping(),
    ]);

    const status = db && cache ? 'ok' : 'degraded';
    return {
      status,
      checks: {
        postgres: db ? 'up' : 'down',
        redis: cache ? 'up' : 'down',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
