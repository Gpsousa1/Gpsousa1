import { Module } from '@nestjs/common';
import { AttestationController } from './attestation.controller';
import { AttestationService } from './attestation.service';
import { BUREAU_PROVIDER, NoopBureauProvider } from './bureau.provider';

@Module({
  controllers: [AttestationController],
  providers: [
    AttestationService,
    // Swap NoopBureauProvider for a real bureau/SCR integration in a future phase.
    { provide: BUREAU_PROVIDER, useClass: NoopBureauProvider },
  ],
  exports: [AttestationService],
})
export class CreditScoringModule {}
