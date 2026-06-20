import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('RedisModule');
        const url = config.get<string>('redis.url') as string;
        const client = new Redis(url, {
          maxRetriesPerRequest: 2,
          lazyConnect: false,
          retryStrategy: (times) => Math.min(times * 200, 2000),
        });
        client.on('connect', () => logger.log('Connected to Redis'));
        client.on('error', (err) => logger.error(`Redis error: ${err.message}`));
        return client;
      },
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
