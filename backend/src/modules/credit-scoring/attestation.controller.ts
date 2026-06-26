import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Audit } from '../../common/audit/audit.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AttestationService } from './attestation.service';
import { IssueAttestationDto, RecordOutcomeDto } from './dto/attestation.dto';

/** CCFV v2 — atestação de crédito bank-grade (consumível por banco parceiro). */
@Controller({ path: 'credit-certificate', version: '1' })
export class AttestationController {
  constructor(private readonly attestation: AttestationService) {}

  @Post('attestations')
  @Audit('attestation.issue', 'credit-certificate')
  issue(@CurrentUser('id') userId: string, @Body() dto: IssueAttestationDto) {
    return this.attestation.issue(userId, dto);
  }

  @Get('attestations')
  list(@CurrentUser('id') userId: string) {
    return this.attestation.list(userId);
  }

  @Get('attestations/:id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.attestation.get(userId, id);
  }

  /** Public: a partner bank validates the attestation by its hash. */
  @Public()
  @Get('verify/:hash')
  verify(@Param('hash') hash: string) {
    return this.attestation.verify(hash);
  }

  @Get('models')
  @UseGuards(RolesGuard)
  @Roles(RoleName.ADMIN)
  models() {
    return this.attestation.listModels();
  }

  @Post('outcomes')
  @UseGuards(RolesGuard)
  @Roles(RoleName.PARTNER, RoleName.ADMIN)
  @Audit('credit.outcome', 'credit-certificate')
  outcome(@Body() dto: RecordOutcomeDto) {
    return this.attestation.recordOutcome(dto);
  }
}
