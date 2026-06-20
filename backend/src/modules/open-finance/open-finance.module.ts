import { Module } from '@nestjs/common';
import { OpenFinanceController } from './open-finance.controller';
import {
  NoopOpenFinanceProvider,
  OPEN_FINANCE_PROVIDER,
} from './open-finance.provider';
import { OpenFinanceService } from './open-finance.service';

@Module({
  controllers: [OpenFinanceController],
  providers: [
    OpenFinanceService,
    // Swap NoopOpenFinanceProvider for a real aggregator in a future phase.
    { provide: OPEN_FINANCE_PROVIDER, useClass: NoopOpenFinanceProvider },
  ],
  exports: [OpenFinanceService],
})
export class OpenFinanceModule {}
