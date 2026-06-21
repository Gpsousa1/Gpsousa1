import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Audit } from '../../common/audit/audit.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { PostLedgerDto } from './dto/ledger.dto';
import { LedgerService } from './ledger.service';

@Controller({ path: 'ledger', version: '1' })
@UseGuards(RolesGuard)
@Roles(RoleName.ADMIN)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('accounts')
  accounts() {
    return this.ledger.listAccounts();
  }

  @Get('transactions')
  transactions(@Query('take') take?: string) {
    return this.ledger.listTransactions(take ? parseInt(take, 10) : undefined);
  }

  @Get('balance/:accountCode')
  balance(@Param('accountCode') accountCode: string) {
    return this.ledger.balance(accountCode);
  }

  @Post('transactions')
  @Audit('ledger.post', 'ledger')
  post(@Body() dto: PostLedgerDto) {
    return this.ledger.post(dto);
  }

  @Post('transactions/:id/reconcile')
  @Audit('ledger.reconcile', 'ledger')
  reconcile(@Param('id') id: string) {
    return this.ledger.reconcile(id);
  }
}
