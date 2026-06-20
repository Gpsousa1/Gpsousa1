import { Global, Module } from '@nestjs/common';
import { GamificationService } from './gamification.service';

@Global()
@Module({
  providers: [GamificationService],
  exports: [GamificationService],
})
export class GamificationModule {}
