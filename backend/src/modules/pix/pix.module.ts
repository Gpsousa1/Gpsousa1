import { Module } from '@nestjs/common';
import { PixController } from './pix.controller';
import { NoopPixProvider, PIX_PROVIDER } from './pix.provider';
import { PixService } from './pix.service';

@Module({
  controllers: [PixController],
  providers: [
    PixService,
    // Swap NoopPixProvider for a real PSP in a future phase.
    { provide: PIX_PROVIDER, useClass: NoopPixProvider },
  ],
  exports: [PixService],
})
export class PixModule {}
