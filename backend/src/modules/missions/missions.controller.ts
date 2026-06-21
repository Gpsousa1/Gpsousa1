import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Audit } from '../../common/audit/audit.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { EvaluateMissionsDto } from './dto/mission.dto';
import { MissionsService } from './missions.service';

@Controller({ path: 'missions', version: '1' })
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.missions.listForUser(userId);
  }

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @Audit('missions.evaluate', 'missions')
  evaluate(@CurrentUser('id') userId: string, @Body() dto: EvaluateMissionsDto) {
    return this.missions.evaluate(userId, dto);
  }
}
