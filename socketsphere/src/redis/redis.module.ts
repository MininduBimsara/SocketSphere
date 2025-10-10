import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Redis Module - Global module for Redis integration
 *
 * @Global decorator makes this module available throughout the application
 * without needing to import it in every module
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
