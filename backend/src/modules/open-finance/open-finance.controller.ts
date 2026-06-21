import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';
import { Audit } from '../../common/audit/audit.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { OpenFinanceService } from './open-finance.service';

class CreateConsentDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  scopes: string[];
}

@Controller({ path: 'open-finance', version: '1' })
export class OpenFinanceController {
  constructor(private readonly openFinance: OpenFinanceService) {}

  @Post('consents')
  @Audit('open_finance.consent.create', 'open-finance')
  createConsent(@CurrentUser('id') userId: string, @Body() dto: CreateConsentDto) {
    return this.openFinance.createConsent(userId, dto.scopes);
  }

  @Get('consents')
  list(@CurrentUser('id') userId: string) {
    return this.openFinance.listConsents(userId);
  }

  @Post('consents/:id/revoke')
  @Audit('open_finance.consent.revoke', 'open-finance')
  revoke(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.openFinance.revoke(userId, id);
  }

  @Post('consents/:id/sync')
  @Audit('open_finance.sync', 'open-finance')
  sync(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.openFinance.sync(userId, id);
  }
}
