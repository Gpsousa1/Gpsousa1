import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { Audit } from '../../common/audit/audit.decorator';
import { Idempotent } from '../../common/idempotency/idempotency.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import { PixService } from './pix.service';

class CreateChargeDto {
  @IsNumber()
  @Min(0.01)
  valor: number;
}

class CreateTransferDto {
  @IsNumber()
  @Min(0.01)
  valor: number;

  @IsString()
  pixKey: string;
}

class PixWebhookDto {
  @IsString()
  provider: string;

  @IsString()
  event: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

@Controller({ path: 'pix', version: '1' })
export class PixController {
  constructor(private readonly pix: PixService) {}

  @Post('charges')
  @Idempotent()
  @Audit('pix.charge.create', 'pix')
  createCharge(@CurrentUser('id') userId: string, @Body() dto: CreateChargeDto) {
    return this.pix.createCharge(userId, dto.valor);
  }

  @Get('charges')
  listCharges(@CurrentUser('id') userId: string) {
    return this.pix.listCharges(userId);
  }

  @Get('charges/:txid')
  getCharge(@Param('txid') txid: string) {
    return this.pix.getCharge(txid);
  }

  @Post('transfers')
  @Idempotent()
  @Audit('pix.transfer.create', 'pix')
  createTransfer(@CurrentUser('id') userId: string, @Body() dto: CreateTransferDto) {
    return this.pix.createTransfer(userId, dto.valor, dto.pixKey);
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  webhook(@Body() dto: PixWebhookDto) {
    return this.pix.handleWebhook(dto.provider, dto.event, dto.payload ?? {});
  }
}
