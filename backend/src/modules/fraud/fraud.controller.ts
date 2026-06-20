import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Request } from 'express';
import { Audit } from '../../common/audit/audit.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { BlacklistEntryDto, EvaluateFraudDto } from './dto/fraud.dto';
import { FraudService } from './fraud.service';

@Controller({ path: 'fraud', version: '1' })
export class FraudController {
  constructor(private readonly fraud: FraudService) {}

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @Audit('fraud.evaluate', 'fraud')
  evaluate(
    @CurrentUser('id') userId: string,
    @Body() dto: EvaluateFraudDto,
    @Req() req: Request,
  ) {
    return this.fraud.evaluate(dto, {
      userId,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
  }

  @Get('rules')
  rules() {
    return this.fraud.listRules();
  }

  @Get('scores')
  scores(@CurrentUser('id') userId: string, @Query('take') take?: string) {
    return this.fraud.listScores(userId, take ? parseInt(take, 10) : undefined);
  }

  @Get('events')
  @UseGuards(RolesGuard)
  @Roles(RoleName.ADMIN)
  events(@Query('take') take?: string) {
    return this.fraud.listEvents(take ? parseInt(take, 10) : undefined);
  }

  @Get('blacklist')
  @UseGuards(RolesGuard)
  @Roles(RoleName.ADMIN)
  blacklist() {
    return this.fraud.listBlacklist();
  }

  @Post('blacklist')
  @UseGuards(RolesGuard)
  @Roles(RoleName.ADMIN)
  @Audit('fraud.blacklist.add', 'fraud')
  addBlacklist(@Body() dto: BlacklistEntryDto) {
    return this.fraud.addBlacklist(dto);
  }
}
