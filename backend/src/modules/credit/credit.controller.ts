import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Request } from 'express';
import { Audit } from '../../common/audit/audit.decorator';
import { Idempotent } from '../../common/idempotency/idempotency.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { parseCursorArgs } from '../../common/pagination/cursor';
import {
  ApproveCreditDto,
  RejectCreditDto,
  RequestCreditDto,
  SimulateCreditDto,
} from './dto/credit.dto';
import { CreditService } from './credit.service';

@Controller({ path: 'credit', version: '1' })
export class CreditController {
  constructor(private readonly credit: CreditService) {}

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  simulate(@Body() dto: SimulateCreditDto) {
    return this.credit.simulate(dto);
  }

  @Get('limits')
  limits(
    @CurrentUser('id') userId: string,
    @Query('score') score?: string,
    @Query('faturamento') faturamento?: string,
  ) {
    return this.credit.limits(
      userId,
      score ? parseInt(score, 10) : undefined,
      faturamento ? parseFloat(faturamento) : 0,
    );
  }

  @Post('applications')
  @Idempotent()
  @Audit('credit.request', 'credit')
  request(@CurrentUser('id') userId: string, @Body() dto: RequestCreditDto, @Req() req: Request) {
    return this.credit.request(userId, dto, {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
  }

  @Get('applications')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    const privileged = user.roles.includes(RoleName.ADMIN) || user.roles.includes(RoleName.PARTNER);
    return this.credit.list(user.id, privileged, parseCursorArgs(cursor, take));
  }

  @Get('applications/:id')
  get(@Param('id') id: string) {
    return this.credit.get(id);
  }

  @Post('applications/:id/pre-analise')
  @UseGuards(RolesGuard)
  @Roles(RoleName.PARTNER, RoleName.ADMIN)
  @Audit('credit.pre_analise', 'credit')
  preAnalise(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.credit.preAnalise(id, actorId);
  }

  @Post('applications/:id/approve')
  @UseGuards(RolesGuard)
  @Roles(RoleName.PARTNER, RoleName.ADMIN)
  @Audit('credit.approve', 'credit')
  approve(@Param('id') id: string, @Body() dto: ApproveCreditDto, @CurrentUser('id') actorId: string) {
    return this.credit.approve(id, dto, actorId);
  }

  @Post('applications/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(RoleName.PARTNER, RoleName.ADMIN)
  @Audit('credit.reject', 'credit')
  reject(@Param('id') id: string, @Body() dto: RejectCreditDto, @CurrentUser('id') actorId: string) {
    return this.credit.reject(id, dto, actorId);
  }

  @Post('applications/:id/release')
  @UseGuards(RolesGuard)
  @Roles(RoleName.PARTNER, RoleName.ADMIN)
  @Idempotent()
  @Audit('credit.release', 'credit')
  release(@Param('id') id: string) {
    return this.credit.release(id);
  }
}
